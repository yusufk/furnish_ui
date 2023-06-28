// Create a new Three.js scene and renderer
const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer();

// Add a camera to the scene and position it to view the 3D space
const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(-15, 5, -15);

// Create a WebGL renderer and set its size to match the dimensions of the container element
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('view').appendChild(renderer.domElement);

// Create a new Three.js object for each item in the list of objects and position it according to its location and position
const objects = [];

const tableRows = document.querySelectorAll('tbody tr');
tableRows.forEach(row => {
  const name = row.querySelector('input[name="name[]"]').value;
  const description = row.querySelector('input[name="description[]"]').value;
  const x = parseFloat(row.querySelector('input[name="x[]"]').value);
  const y = parseFloat(row.querySelector('input[name="y[]"]').value);
  const z = parseFloat(row.querySelector('input[name="z[]"]').value);
  const width = parseFloat(row.querySelector('input[name="width[]"]').value);
  const height = parseFloat(row.querySelector('input[name="height[]"]').value);
  const depth = parseFloat(row.querySelector('input[name="depth[]"]').value);


  const geometry = new THREE.BoxGeometry(width, height, depth);
  //assign either red, green, or blue based on a hash of the name
  const namehash = name.split("").reduce(function (a, b) { a = ((a << 5) - a) + b.charCodeAt(0); return a & a }, 0)
  let color = Math.floor(Math.abs(namehash) % 3);
  var material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
  if (color == 0) {
    material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
  }
  else if (color == 1) {
    material = new THREE.MeshStandardMaterial({ color: 0x0000ff });
  }
  else {
    material = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
  }
  const object = new THREE.Mesh(geometry, material);
  object.position.set(x, y, z);
  object.name = name;
  
  scene.add(object);

  objects.push({ name, description, x, y, z });
});

// Create a new OrbitControls object and attach it to the camera
const controls = new THREE.OrbitControls(camera, renderer.domElement);

let floor, wall1, wall2;

// Create a room with dimensions specified by the user on the webpage
function createRoom() {
  // Get the values of the input elements
  const width = parseFloat(document.getElementById('width-input').value);
  const height = parseFloat(document.getElementById('height-input').value);
  const depth = parseFloat(document.getElementById('depth-input').value);

  // Create new objects with the updated dimensions and add them to the scene
  const floorGeometry = new THREE.BoxGeometry(width, 0.1, depth);
  const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x808080 });
  floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.position.set(0, 0, 0);
  scene.add(floor);

  const wall1Geometry = new THREE.BoxGeometry(0.1, height, depth);
  const wall1Material = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });
  wall1 = new THREE.Mesh(wall1Geometry, wall1Material);
  wall1.position.set(width / 2 - 0.05, height / 2, 0);
  scene.add(wall1);

  const wall2Geometry = new THREE.BoxGeometry(width, height, 0.1);
  const wall2Material = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });
  wall2 = new THREE.Mesh(wall2Geometry, wall2Material);
  wall2.position.set(0, height / 2, depth / 2 - 0.05);
  scene.add(wall2);
}

createRoom();

// Create a grid of lights on the ceiling

const lightIntensity = 0.5;
const lightDistance = 10;

for (let x = -5; x <= 5; x++) {
  for (let z = -5; z <= 5; z++) {
    const pointLight = new THREE.PointLight(0xffffff, lightIntensity, lightDistance);
    pointLight.position.set(x, 4, z);
    scene.add(pointLight);
  }
}

// Render the scene using the WebGL renderer
function render() {
  requestAnimationFrame(render);

  // Update the controls to move the camera
  controls.update();

  // Render the scene with the updated camera position and orientation
  renderer.render(scene, camera);
}

render();

// Function to refresh the positions of the objects in the scene
function refreshPositions() {
  const tableRows = document.querySelectorAll('tbody tr');
  tableRows.forEach((row, index) => {
    const x = parseFloat(row.querySelector('input[name="x[]"]').value);
    const y = parseFloat(row.querySelector('input[name="y[]"]').value);
    const z = parseFloat(row.querySelector('input[name="z[]"]').value);
    const width = parseFloat(row.querySelector('input[name="width[]"]').value);
    const height = parseFloat(row.querySelector('input[name="height[]"]').value);
    const depth = parseFloat(row.querySelector('input[name="depth[]"]').value);

    const geometry = new THREE.BoxGeometry(width, height, depth);

    //Update the position and size of the object
    const object = objects[index];
    object.x = x;
    object.y = y;
    object.z = z;

    const mesh = scene.getObjectByName(object.name);
    if (mesh) {
      mesh.geometry = geometry;
      mesh.position.set(x, y, z);
    }
  });
}

// Display the "fetching" status in the status label
const statusLabel = document.getElementById('status-label');

// Add an event listener to the decorate button
document.getElementById('decorate-button').addEventListener('click', async () => {
  try {
    // Display the "fetching" status
    statusLabel.innerText = 'Status: Fetching...';

    // Get the room dimensions
    const dim_x = parseFloat(document.getElementById('width-input').value);
    const dim_y = parseFloat(document.getElementById('height-input').value);
    const dim_z = parseFloat(document.getElementById('depth-input').value);

    // Get the objects in the scene
    const objects = [];
    const tableRows = document.querySelectorAll('tbody tr');
    tableRows.forEach((row, index) => {
      const name = row.querySelector('input[name="name[]"]').value;
      const description = row.querySelector('input[name="description[]"]').value;
      const width = parseFloat(row.querySelector('input[name="width[]"]').value);
      const height = parseFloat(row.querySelector('input[name="height[]"]').value);
      const depth = parseFloat(row.querySelector('input[name="depth[]"]').value);
      // use data-name attribute to identify the object
      const id = row.getAttribute('data-name');
      objects.push({ name, description, dimensions: { dim_x: width, dim_y: height, dim_z: depth } });
    });

    // Create the request body
    const requestBody = {
      room_dimensions: { dim_x, dim_y, dim_z },
      objects,
    };

    // Call the API to get the updated positions of the objects
    const response = await fetch('https://furnish.azurewebsites.net/api/furnish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    const responseBody = await response.json();
    console.log(responseBody);

    // Display the "fetched" status
    statusLabel.innerText = 'Status: Done!';

    // Update the positions of the objects in the web form
    responseBody.objects.forEach(({ id, position }) => {
      const objectRow = document.querySelector(`tr[data-name="${id}"]`);
      if (objectRow) {
        objectRow.querySelector('input[name="x[]"]').value = position.x.toFixed(2);
        objectRow.querySelector('input[name="y[]"]').value = position.y.toFixed(2);
        objectRow.querySelector('input[name="z[]"]').value = position.z.toFixed(2);
      }
    });

    // Display the approach used by the API
    const approach = responseBody.approach;
    const approachElement = document.getElementById('approach');
    approachElement.textContent = `Approach: ${approach}`;
    refreshPositions();
  } catch (error) {
    console.error(error);
  }
});

// Add an event listener to the refresh button that calls a function to redraw the scene
document.getElementById('refresh-button').addEventListener('click', () => {
  // Remove the floor and lights from the scene
  scene.remove(floor);
  scene.remove(wall1);
  scene.remove(wall2);
  refreshPositions();

  // Create a new room with the updated dimensions
  createRoom();

});