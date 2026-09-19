// Cloudflare Worker — CORS-locked proxy + auth guard for the Furnisher Azure Function.
//
// Why this exists:
//   The Azure Function was deployed ANONYMOUS, so anyone could POST to it and
//   burn Azure OpenAI quota on Yusuf's bill. This Worker:
//     1. Rejects requests that don't come from an allowed origin (CORS + Origin check)
//     2. Adds the Azure Function key (?code=...) server-side, so the browser never sees it
//     3. Applies a lightweight per-IP rate limit as a backstop
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

// Simple in-memory rate limit (per Worker isolate). Backstop only — the real
// protection is the origin check + secret key. 20 requests / 10 min / IP.
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const hits = new Map();

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

function rateLimited(ip) {
  const now = Date.now();
  const rec = hits.get(ip);
  if (!rec || now - rec.start > RATE_WINDOW_MS) {
    hits.set(ip, { start: now, count: 1 });
    return false;
  }
  rec.count += 1;
  return rec.count > RATE_LIMIT;
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

    // Rate-limit backstop
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if (rateLimited(ip)) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again later." }), {
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

    const body = await request.text();
    const target = `${FUNCTION_URL}?code=${encodeURIComponent(env.FUNCTION_KEY)}`;

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
