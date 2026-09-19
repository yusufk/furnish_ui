// Cloudflare Worker — CORS-locked proxy + auth guard for the Furnisher Azure Function.
//
// Why this exists:
//   The Azure Function was deployed ANONYMOUS, so anyone could POST to it and
//   burn Azure OpenAI quota on Yusuf's bill. This Worker:
//     1. Rejects requests that don't come from an allowed origin (CORS + Origin check)
//     2. Adds the Azure Function key (?code=...) server-side, so the browser never sees it
//     3. Validates + bounds the payload (caps Azure OpenAI token cost per call)
//     4. Applies Cloudflare's native per-IP rate limit (burst protection)
//
// Deploy:
//   cd worker
//   wrangler deploy
//   wrangler secret put FUNCTION_KEY      # paste the Azure Function key (host or function key)
//
// The Azure Function must be redeployed with authLevel = FUNCTION (not ANONYMOUS)
// so that the ?code= key is actually required.

const FUNCTION_URL = "https://furnishcopilot.azurewebsites.net/api/furnish";

const ALLOWED_ORIGINS = [
  "https://yusuf.kaka.co.za",
  "https://yusufk.github.io",
  "http://localhost",
];

function isAllowed(origin) {
  return ALLOWED_ORIGINS.some((o) => origin.startsWith(o));
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": isAllowed(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

// Validate the request body: bounded objects, bounded strings, numeric dims.
// Returns an error string if invalid, or null if OK. Defends against prompt-bloat
// abuse (huge object lists / long descriptions inflating Azure OpenAI token cost).
const MAX_OBJECTS = 20;
const MAX_STR = 200;   // max length for any description/id/colour/suggestion
const MAX_DIM = 1000;  // sane upper bound on a dimension (metres)

function validatePayload(body) {
  let data;
  try {
    data = JSON.parse(body);
  } catch {
    return "Invalid JSON.";
  }
  const rd = data.room_dimensions;
  if (!rd || typeof rd !== "object") return "Missing room_dimensions.";
  for (const k of ["dim_x", "dim_y", "dim_z"]) {
    const v = rd[k];
    if (typeof v !== "number" || !isFinite(v) || v <= 0 || v > MAX_DIM) {
      return `room_dimensions.${k} must be a number between 0 and ${MAX_DIM}.`;
    }
  }
  const objs = data.objects;
  if (!Array.isArray(objs) || objs.length === 0) return "objects must be a non-empty array.";
  if (objs.length > MAX_OBJECTS) return `Too many objects (max ${MAX_OBJECTS}).`;
  for (const o of objs) {
    if (!o || typeof o !== "object") return "Each object must be an object.";
    for (const [key, val] of Object.entries(o)) {
      if (typeof val === "string" && val.length > MAX_STR) {
        return `Field "${key}" exceeds ${MAX_STR} characters.`;
      }
    }
  }
  if (typeof data.suggestion === "string" && data.suggestion.length > MAX_STR) {
    return `suggestion exceeds ${MAX_STR} characters.`;
  }
  return null;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";

    // Preflight
    if (request.method === "OPTIONS") {
      if (!isAllowed(origin)) return new Response("Forbidden", { status: 403 });
      return new Response(null, { headers: corsHeaders(origin) });
    }

    // Only allow calls from our own front-end
    if (!isAllowed(origin)) {
      return new Response(JSON.stringify({ error: "Forbidden origin" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }

    // Native Cloudflare rate limit (burst protection): 5 req / 60s per IP.
    // Keyed on client IP — for an anonymous demo this is the right abuse key.
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const { success } = await env.RATE_LIMITER.limit({ key: ip });
    if (!success) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded. Slow down and try again shortly." }), {
        status: 429,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }

    // Hard daily cap: 20 requests / day per IP, persisted in KV.
    // Key includes the UTC date so it resets naturally each day; TTL cleans up.
    // We CHECK here (fail fast) but only INCREMENT once the request passes
    // validation and is about to hit Azure — so bad payloads don't burn quota.
    const DAILY_CAP = 20;
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
    const dayKey = `day:${ip}:${today}`;
    const currentRaw = await env.DAILY_LIMITS.get(dayKey);
    const current = currentRaw ? parseInt(currentRaw, 10) : 0;
    if (current >= DAILY_CAP) {
      return new Response(JSON.stringify({ error: "Daily limit reached (20/day). Try again tomorrow." }), {
        status: 429,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }

    // Ensure the function key is configured
    if (!env.FUNCTION_KEY) {
      return new Response(JSON.stringify({ error: "Proxy not configured (missing key)." }), {
        status: 500,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }

    // Cap raw body size before doing anything else (defends against huge payloads)
    const MAX_BODY_BYTES = 8 * 1024; // 8 KB is ample for a room + objects
    const body = await request.text();
    if (body.length > MAX_BODY_BYTES) {
      return new Response(JSON.stringify({ error: "Payload too large." }), {
        status: 413,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }

    // Validate the shape and bounds of the request (defends against prompt bloat)
    const validationError = validatePayload(body);
    if (validationError) {
      return new Response(JSON.stringify({ error: validationError }), {
        status: 422,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }

    const target = `${FUNCTION_URL}?code=${encodeURIComponent(env.FUNCTION_KEY)}`;

    // Count this request against the daily cap (valid + about to hit Azure).
    await env.DAILY_LIMITS.put(dayKey, String(current + 1), { expirationTtl: 60 * 60 * 26 });

    try {
      const resp = await fetch(target, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      const respBody = await resp.text();
      return new Response(respBody, {
        status: resp.status,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: "Upstream error", detail: e.message }), {
        status: 502,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }
  },
};
