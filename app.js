// Create a new Three.js scene and renderer
const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer();

// Add a camera to the scene and position it to view the 3D space
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 5, 10);

// Create a WebGL renderer and set its size to match the dimensions of the container element
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('container').appendChild(renderer.domElement);

// Create a new Three.js object for each item in the list of objects and position it according to its location and position
const objects = [
  { name: 'chair', x: 0, y: 0, z: 0 },
  { name: 'table', x: 1, y: 0, z: 0 },
  { name: 'lamp', x: 0, y: 1, z: 0 },
];

objects.forEach(({ name, x, y, z }) => {
  const geometry = new THREE.BoxGeometry(2, 2, 2);
  const material = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
  const cube = new THREE.Mesh(geometry, material);
  cube.position.set(x, y, z);
  scene.add(cube);
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
  floor.position.set(0, -1, 0);
  scene.add(floor);

  const wall1Geometry = new THREE.BoxGeometry(0.1, height, depth);
  const wall1Material = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });
  wall1 = new THREE.Mesh(wall1Geometry, wall1Material);
  wall1.position.set(width / 2 - 0.05, height / 2 - 1, 0);
  scene.add(wall1);

  const wall2Geometry = new THREE.BoxGeometry(width, height, 0.1);
  const wall2Material = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });
  wall2 = new THREE.Mesh(wall2Geometry, wall2Material);
  wall2.position.set(0, height / 2 - 1, depth / 2 - 0.05);
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

// Add an event listener to the refresh button that calls a function to redraw the scene
document.getElementById('refresh-button').addEventListener('click', () => {
  // Remove the floor and lights from the scene
  scene.remove(floor);
  scene.remove(wall1);
  scene.remove(wall2);

  // Create a new room with the updated dimensions
  createRoom();

});