import * as THREE from 'https://unpkg.com/three@0.166.1/build/three.module.js';

const MAP_HALF_SIZE = 22;

const OBSTACLE_LAYOUT = [
  { x: -9, z: -7, w: 4.5, d: 4.5, h: 2.6, color: 0xd96d6d },
  { x: 8.5, z: -8, w: 3.8, d: 5.2, h: 2.9, color: 0x6fa8dc },
  { x: -7, z: 8, w: 5.4, d: 2.6, h: 2.2, color: 0x93c47d },
  { x: 8, z: 8, w: 4.4, d: 3.0, h: 2.0, color: 0xf6b26b },
  { x: 0, z: 0, w: 6.2, d: 2.4, h: 1.9, color: 0x8e7cc3 },
  { x: 0, z: -12, w: 8.5, d: 2.0, h: 1.7, color: 0x76a5af }
];

export function createSceneSystem(container) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9ed6ff);

  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.set(0, 6, 10);
  scene.add(camera);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.72);
  scene.add(ambientLight);

  const directional = new THREE.DirectionalLight(0xffffff, 1.05);
  directional.position.set(8, 16, 8);
  scene.add(directional);

  const groundSize = MAP_HALF_SIZE * 2;

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(groundSize, groundSize),
    new THREE.MeshStandardMaterial({ color: 0x6dbb78, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  scene.add(ground);

  const grid = new THREE.GridHelper(groundSize, 44, 0x3a3a3a, 0x666666);
  grid.position.y = 0.01;
  scene.add(grid);

  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x9096a8, roughness: 0.8 });
  const wallHeight = 3;
  const wallThickness = 0.8;

  const northWall = new THREE.Mesh(
    new THREE.BoxGeometry(groundSize + wallThickness * 2, wallHeight, wallThickness),
    wallMaterial
  );
  northWall.position.set(0, wallHeight / 2, -MAP_HALF_SIZE - wallThickness / 2);

  const southWall = northWall.clone();
  southWall.position.z = MAP_HALF_SIZE + wallThickness / 2;

  const eastWall = new THREE.Mesh(
    new THREE.BoxGeometry(wallThickness, wallHeight, groundSize + wallThickness * 2),
    wallMaterial
  );
  eastWall.position.set(MAP_HALF_SIZE + wallThickness / 2, wallHeight / 2, 0);

  const westWall = eastWall.clone();
  westWall.position.x = -MAP_HALF_SIZE - wallThickness / 2;

  scene.add(northWall, southWall, eastWall, westWall);

  const obstacleColliders = [];

  for (const item of OBSTACLE_LAYOUT) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(item.w, item.h, item.d),
      new THREE.MeshStandardMaterial({ color: item.color, roughness: 0.75 })
    );
    mesh.position.set(item.x, item.h / 2, item.z);
    scene.add(mesh);

    obstacleColliders.push({
      minX: item.x - item.w / 2,
      maxX: item.x + item.w / 2,
      minZ: item.z - item.d / 2,
      maxZ: item.z + item.d / 2,
      centerX: item.x,
      centerZ: item.z,
      height: item.h
    });
  }

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', onResize);

  function render() {
    renderer.render(scene, camera);
  }

  function dispose() {
    window.removeEventListener('resize', onResize);
    renderer.dispose();
  }

  return {
    THREE,
    scene,
    camera,
    renderer,
    render,
    dispose,
    world: {
      mapHalfSize: MAP_HALF_SIZE,
      obstacleColliders
    }
  };
}
