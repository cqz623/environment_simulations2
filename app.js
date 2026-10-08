import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  BOUNDS, NODES, EDGES, DESTINATIONS, blockedEdges,
  createInitialState, createPedestrian, selectDestination,
  addObstacle, removeObstacle, tick
} from "./simulation.js?v=20261008-times-square1";
import { landmarksFor, occupantsAt, relativeLocation, resolveDescription, semanticLocation } from "./location.js?v=20261008-times-square1";

const $ = (selector) => document.querySelector(selector);
const host = $("#canvas-host");
const labelsHost = $("#map-labels");
const palette = ["#ba7355", "#567d83", "#a8895e", "#78916f", "#856d79", "#4a7770"];
let state = createInitialState();
let selectedId = state.pedestrians[0].id;
let mode = null;
let lastFrame = performance.now();
let lastUI = 0;
let pointerStart = null;
let inspectedPoint = null;
let resolvedPoint = null;
let resolvedRule = "";
let activeTab = "location";

const scene = new THREE.Scene();
scene.background = new THREE.Color("#abb8c2");
scene.fog = new THREE.Fog("#abb8c2", 65, 115);
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 130);
camera.position.set(31, 31, 35);
camera.lookAt(0, 0, 0);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.52;
host.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.075;
controls.minDistance = 25;
controls.maxDistance = 72;
controls.minPolarAngle = 0.4;
controls.maxPolarAngle = 1.35;
controls.enablePan = false;
controls.update();

scene.add(new THREE.HemisphereLight("#ffffff", "#82918c", 2.2));
const sun = new THREE.DirectionalLight("#fff4db", 3);
sun.position.set(-16, 29, 14);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -35;
sun.shadow.camera.right = 35;
sun.shadow.camera.top = 35;
sun.shadow.camera.bottom = -35;
sun.shadow.bias = -0.0002;
scene.add(sun);
const fill = new THREE.DirectionalLight("#d2e5e2", 0.8);
fill.position.set(15, 12, -18);
scene.add(fill);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(100, 100),
  new THREE.MeshStandardMaterial({ color: "#697177", roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.31;
ground.receiveShadow = true;
scene.add(ground);

function pavingTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const context = canvas.getContext("2d");
  context.fillStyle = "#a8afb0";
  context.fillRect(0, 0, 128, 128);
  context.strokeStyle = "#858e90";
  context.lineWidth = 1;
  context.strokeRect(0.5, 0.5, 127, 127);
  context.beginPath();
  context.moveTo(64.5, 0);
  context.lineTo(64.5, 128);
  context.moveTo(0, 64.5);
  context.lineTo(128, 64.5);
  context.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(7, 7);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const plaza = new THREE.Mesh(
  new THREE.BoxGeometry(28.4, 0.33, 28.4),
  new THREE.MeshStandardMaterial({ color: "#a8afb0", roughness: 0.96 })
);
plaza.position.y = -0.16;
plaza.receiveShadow = true;
plaza.castShadow = true;
scene.add(plaza);
const plazaTop = new THREE.Mesh(
  new THREE.PlaneGeometry(28, 28),
  new THREE.MeshStandardMaterial({ map: pavingTexture(), roughness: 0.95 })
);
plazaTop.rotation.x = -Math.PI / 2;
plazaTop.position.y = 0.013;
plazaTop.receiveShadow = true;
scene.add(plazaTop);

const edgeLine = new THREE.LineLoop(
  new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-14, 0.035, -14), new THREE.Vector3(14, 0.035, -14),
    new THREE.Vector3(14, 0.035, 14), new THREE.Vector3(-14, 0.035, 14)
  ]),
  new THREE.LineBasicMaterial({ color: "#607d76", transparent: true, opacity: 0.62 })
);
scene.add(edgeLine);

// A diagonal paving band suggests Broadway crossing the Midtown street grid.
const broadwayBand = new THREE.Mesh(
  new THREE.BoxGeometry(5.4, 0.015, 37),
  new THREE.MeshStandardMaterial({ color: "#777f84", roughness: 1 })
);
broadwayBand.position.y = 0.026;
broadwayBand.rotation.y = Math.PI / 4;
broadwayBand.receiveShadow = true;
scene.add(broadwayBand);

function material(color, roughness = 0.85) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.04 });
}
function box(parent, width, height, depth, x, y, z, color, cast = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material(color));
  mesh.position.set(x, y, z);
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function cylinder(parent, radiusTop, radiusBottom, height, x, y, z, color, segments = 12) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments),
    material(color)
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function sphere(parent, radius, x, y, z, color, detail = 1) {
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, detail), material(color));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}
function disc(parent, radius, x, y, z, color, opacity = 1) {
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 40),
    new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: false })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}
function tree(parent, x, z, scale = 1) {
  cylinder(parent, 0.12 * scale, 0.17 * scale, 1.6 * scale, x, 0.85 * scale, z, "#786d55");
  sphere(parent, 0.75 * scale, x, 2.05 * scale, z, "#779578", 2);
  sphere(parent, 0.58 * scale, x - 0.43 * scale, 1.9 * scale, z + 0.2 * scale, "#668970", 1);
  sphere(parent, 0.55 * scale, x + 0.35 * scale, 2.23 * scale, z - 0.2 * scale, "#8ca681", 1);
}

function billboardTexture(title, subtitle, start, end) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  const gradient = context.createLinearGradient(0, 0, 512, 256);
  gradient.addColorStop(0, start);
  gradient.addColorStop(1, end);
  context.fillStyle = gradient;
  context.fillRect(0, 0, 512, 256);
  context.fillStyle = "rgba(255,255,255,.13)";
  for (let x = -120; x < 600; x += 95) {
    context.save();
    context.translate(x, 0);
    context.rotate(-0.22);
    context.fillRect(0, 0, 20, 320);
    context.restore();
  }
  context.fillStyle = "#fffaf1";
  context.textAlign = "center";
  context.font = "700 63px Arial";
  context.fillText(title, 256, 120, 470);
  context.font = "700 28px Arial";
  context.letterSpacing = "5px";
  context.fillText(subtitle, 256, 175, 470);
  context.fillRect(72, 199, 368, 5);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function billboard(parent, x, y, z, width, height, facing, title, subtitle, start, end) {
  const frame = new THREE.Mesh(
    new THREE.PlaneGeometry(width + 0.28, height + 0.28),
    new THREE.MeshBasicMaterial({ color: "#151b29", side: THREE.DoubleSide })
  );
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: billboardTexture(title, subtitle, start, end), side: THREE.DoubleSide })
  );
  frame.position.set(x, y, z);
  sign.position.set(x + (facing === "east" ? 0.02 : 0), y, z + (facing === "south" ? 0.02 : 0));
  frame.rotation.y = sign.rotation.y = facing === "east" ? Math.PI / 2 : 0;
  parent.add(frame, sign);
}

const siteObjects = new THREE.Group();
scene.add(siteObjects);
for (const [x, z, w, d] of [[16.5, 0, 4.5, 41], [0, 16.5, 41, 4.5]]) {
  box(siteObjects, w, 0.035, d, x, -0.275, z, "#424a52", false);
}
for (let x = -12; x <= 12; x += 2.2) {
  box(siteObjects, 1.2, 0.02, 2.2, x, -0.24, 16.5, "#e7e8dc", false);
}
for (const [x, z, w, d, h, color] of [
  [-20, -12, 7, 11, 18, "#384554"], [-20, 4, 7, 10, 15, "#465261"],
  [-19, 17, 8, 7, 8, "#53606a"], [20, -15, 7, 9, 9, "#46515e"],
  [21, 0, 9, 13, 7, "#4f5c68"], [18, 18, 8, 8, 5, "#56606a"],
  [-8, -21, 10, 8, 17, "#3b4655"], [7, -21, 13, 8, 20, "#303f50"],
  [-7, 27, 13, 8, 4, "#59636d"], [8, 27, 10, 7, 4, "#59646c"]
]) {
  box(siteObjects, w, h, d, x, h / 2 - 0.25, z, color);
  box(siteObjects, w + 0.25, 0.22, d + 0.25, x, h - 0.12, z, "#273341");
}
billboard(siteObjects, -16.43, 11.4, -12, 8.7, 4.5, "east", "BROADWAY", "THEATRE DISTRICT", "#e23464", "#5c3bb2");
billboard(siteObjects, -16.43, 9.5, 4, 8.0, 3.7, "east", "NEW YORK", "CITY LIGHTS", "#166da8", "#25b6ad");
billboard(siteObjects, -8, 10.8, -16.87, 8.0, 4.0, "south", "42ND ST", "TIMES SQUARE", "#e15d3e", "#b92257");
billboard(siteObjects, 7, 12.5, -16.87, 10.5, 5.0, "south", "TIMES SQUARE", "BROADWAY PLAZA", "#433cac", "#d63c86");
for (const [x, z, scale] of [[-15.7,-10,.75],[-16.2,2,.7],[16.2,-8,.75],[16,8,.8],[-9,15.5,.7]]) {
  tree(siteObjects, x, z, scale);
}

const pathLayer = new THREE.Group();
scene.add(pathLayer);
const pathMeshes = [];
for (const [a, b] of EDGES) {
  const start = NODES[a];
  const end = NODES[b];
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.hypot(dx, dz);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.85, 0.025, length),
    material("#bfc7c8", 1)
  );
  mesh.position.set((start.x + end.x) / 2, 0.045, (start.z + end.z) / 2);
  mesh.rotation.y = Math.atan2(dx, dz);
  mesh.receiveShadow = true;
  pathLayer.add(mesh);
  pathMeshes.push(mesh);
}
function refreshPaths() {
  const blocked = new Set(blockedEdges(state.obstacles).map(([a, b]) => a + "-" + b));
  EDGES.forEach(([a, b], index) => {
    const closed = blocked.has(a + "-" + b);
    pathMeshes[index].material.color.set(closed ? "#777f82" : "#c7cdcc");
    pathMeshes[index].material.opacity = closed ? 0.6 : 1;
    pathMeshes[index].material.transparent = closed;
  });
}

const destinationLayer = new THREE.Group();
scene.add(destinationLayer);
const destinationMeshes = [];
const labels = new Map();
for (const destination of DESTINATIONS) {
  const node = NODES[destination.node];
  disc(destinationLayer, 1.2, node.x, 0.072, node.z, destination.color, 0.35);
  disc(destinationLayer, 0.62, node.x, 0.075, node.z, destination.color, 0.85);
  const marker = cylinder(destinationLayer, 0.22, 0.32, 0.55, node.x, 0.35, node.z, destination.color, 24);
  marker.userData.destinationId = destination.id;
  destinationMeshes.push(marker);
  const label = document.createElement("div");
  label.className = "map-label";
  label.style.setProperty("--dest-color", destination.color);
  label.innerHTML = '<span class="map-label-dot">' + destination.short + '</span><strong>' + destination.name + '</strong>';
  labelsHost.appendChild(label);
  labels.set(destination.id, label);
}
const tablesLabel = document.createElement("div");
tablesLabel.className = "map-label";
tablesLabel.style.setProperty("--dest-color", "#dc6b57");
tablesLabel.innerHTML = '<span class="map-label-dot">✦</span><strong>Public tables</strong>';
labelsHost.appendChild(tablesLabel);

// Places are built around the arrival markers so every destination remains reachable.
const architecture = new THREE.Group();
scene.add(architecture);
// A Broadway entrance, movable plaza furniture, TKTS steps, and a food kiosk.
for (const z of [-1.8, -0.6, 0.6, 1.8]) {
  cylinder(architecture, 0.15, 0.17, 0.8, -12.8, 0.4, z, "#767f84");
}
box(architecture, 0.2, 2.8, 1.6, -12.9, 1.4, 3.1, "#253c58");
box(architecture, 0.22, 0.42, 1.45, -12.75, 2.25, 3.1, "#2f78aa");

for (const [x, z] of [[-11.3, 11.2], [-8.5, 11.8]]) {
  cylinder(architecture, 0.47, 0.47, 0.08, x, 0.72, z, "#d75b56", 24);
  cylinder(architecture, 0.055, 0.055, 0.67, x, 0.36, z, "#59636a");
  for (const dx of [-0.7, 0.7]) {
    box(architecture, 0.35, 0.11, 0.35, x + dx, 0.47, z, "#d75b56");
    box(architecture, 0.08, 0.48, 0.08, x + dx, 0.25, z, "#6b7379");
  }
}

for (let step = 0; step < 5; step++) {
  box(architecture, 5.2, 0.23 + step * 0.21, 0.55,
    10.2, 0.12 + step * 0.105, -10.2 - step * 0.56, "#c94753");
}
box(architecture, 5.6, 0.15, 3.4, 10.2, 0.02, -11.3, "#7f202e");
billboard(architecture, 10.2, 2.0, -13.12, 3.8, 1.15, "south", "TKTS", "RED STEPS", "#cd2b41", "#8e213e");

box(architecture, 3.5, 2.1, 1.8, 10.5, 1.05, 12.2, "#46545d");
box(architecture, 4.0, 0.18, 2.2, 10.5, 2.18, 12.2, "#d46655");
box(architecture, 2.7, 0.62, 0.08, 10.5, 1.05, 11.27, "#e6c78b");
billboard(architecture, 10.5, 2.6, 13.25, 3.2, 0.58, "south", "FOOD", "KIOSK", "#ed9b4b", "#c04b58");

const obstacleLayer = new THREE.Group();
scene.add(obstacleLayer);
const obstacleMeshes = new Map();
function makeObstacle(obstacle) {
  const group = new THREE.Group();
  group.position.set(obstacle.x, 0, obstacle.z);
  group.userData.obstacleId = obstacle.id;
  if (obstacle.type === "planter") {
    cylinder(group, obstacle.radius * 0.7, obstacle.radius * 0.76, 0.58, 0, 0.32, 0, "#9b9b82", 16);
    cylinder(group, obstacle.radius * 0.63, obstacle.radius * 0.63, 0.04, 0, 0.63, 0, "#5b7659", 16);
    for (const [x,z,s] of [[-.35,-.2,.65],[.4,.18,.52],[.05,.4,.42]]) tree(group, x, z, s);
  } else if (obstacle.type === "subway entrance") {
    box(group, 2.15, 0.16, 2.0, 0, 0.1, 0, "#313b45");
    for (const x of [-0.9, 0.9]) {
      cylinder(group, 0.055, 0.055, 1.2, x, 0.7, -0.9, "#8faaa4");
      cylinder(group, 0.055, 0.055, 1.2, x, 0.7, 0.9, "#8faaa4");
    }
    box(group, 2.1, 0.12, 2.05, 0, 1.32, 0, "#3b786a");
    cylinder(group, 0.26, 0.26, 0.1, 0, 1.52, 0, "#e9e5cc", 24);
    billboard(group, 0, 1.88, 1.05, 2.0, 0.55, "south", "SUBWAY", "TIMES SQ", "#1c5393", "#176d91");
  } else if (obstacle.type === "public tables") {
    for (const [x, z] of [[-0.45, 0], [0.45, 0.32]]) {
      cylinder(group, 0.37, 0.37, 0.08, x, 0.69, z, "#d85d55", 20);
      cylinder(group, 0.045, 0.045, 0.66, x, 0.34, z, "#626a6d");
      box(group, 0.27, 0.12, 0.27, x, 0.43, z - 0.58, "#e59b62");
    }
  } else {
    disc(group, obstacle.radius, 0, 0.079, 0, "#c9805d", 0.24);
    for (const x of [-0.8, 0.8]) {
      cylinder(group, 0.11, 0.15, 0.95, x, 0.53, 0, "#c87854", 12);
      box(group, 0.21, 0.14, 0.21, x, 0.55, -0.13, "#f1e9d7");
    }
    box(group, 1.82, 0.23, 0.21, 0, 0.75, 0, "#b5684d");
  }
  obstacleLayer.add(group);
  obstacleMeshes.set(obstacle.id, group);
}
function refreshObstacles() {
  for (const [id, group] of obstacleMeshes) {
    if (!state.obstacles.some((obstacle) => obstacle.id === id)) {
      obstacleLayer.remove(group);
      obstacleMeshes.delete(id);
    }
  }
  for (const obstacle of state.obstacles) if (!obstacleMeshes.has(obstacle.id)) makeObstacle(obstacle);
  refreshPaths();
  renderObstacleList();
  renderReferenceOptions();
  if (resolvedPoint) {
    resolvedPoint = null;
    $("#description-result").textContent = "The space changed. Run the description again for an updated point.";
    if (!inspectedPoint) clearLocationMarker();
  }
}

const peopleLayer = new THREE.Group();
scene.add(peopleLayer);
const peopleMeshes = new Map();
function makePerson(pedestrian) {
  const group = new THREE.Group();
  group.userData.pedestrianId = pedestrian.id;
  const color = palette[(Number(pedestrian.id.slice(1)) - 1) % palette.length];
  cylinder(group, 0.19, 0.24, 0.66, 0, 0.6, 0, color, 12);
  sphere(group, 0.2, 0, 1.11, 0, "#d5aa87", 2);
  box(group, 0.27, 0.07, 0.12, 0, 0.4, -0.22, "#304946");
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(0.46, 0.55, 32),
    new THREE.MeshBasicMaterial({ color: "#bc7859", side: THREE.DoubleSide })
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.1;
  group.add(halo);
  group.userData.halo = halo;
  peopleLayer.add(group);
  peopleMeshes.set(pedestrian.id, group);
}
function refreshPeople() {
  for (const [id, group] of peopleMeshes) {
    if (!state.pedestrians.some((person) => person.id === id)) {
      peopleLayer.remove(group);
      peopleMeshes.delete(id);
    }
  }
  for (const pedestrian of state.pedestrians) if (!peopleMeshes.has(pedestrian.id)) makePerson(pedestrian);
}

const routeLine = new THREE.Line(
  new THREE.BufferGeometry(),
  new THREE.LineDashedMaterial({ color: "#bd7655", dashSize: 0.38, gapSize: 0.24, transparent: true, opacity: 0.9 })
);
routeLine.frustumCulled = false;
scene.add(routeLine);
const locationMarker = new THREE.Group();
const markerRing = new THREE.Mesh(
  new THREE.RingGeometry(0.47, 0.59, 40),
  new THREE.MeshBasicMaterial({ color: "#dc805a", side: THREE.DoubleSide, depthTest: false })
);
markerRing.rotation.x = -Math.PI / 2;
markerRing.position.y = 0.15;
locationMarker.add(markerRing);
const markerStem = cylinder(locationMarker, 0.055, 0.08, 1.25, 0, 0.77, 0, "#c87c56", 12);
markerStem.material.depthTest = false;
const markerTop = sphere(locationMarker, 0.17, 0, 1.43, 0, "#e29c70", 2);
markerTop.material.depthTest = false;
locationMarker.visible = false;
scene.add(locationMarker);
const locationLabel = document.createElement("div");
locationLabel.className = "map-label query-label";
locationLabel.textContent = "LOCATION QUERY";
locationLabel.hidden = true;
labelsHost.appendChild(locationLabel);
function setLocationMarker(point, label) {
  locationMarker.position.set(point.x, 0, point.z);
  locationMarker.visible = true;
  locationLabel.textContent = label;
  locationLabel.hidden = false;
}
function clearLocationMarker() {
  locationMarker.visible = false;
  locationLabel.hidden = true;
}
function updateRouteLine() {
  const pedestrian = state.pedestrians.find((item) => item.id === selectedId);
  const ids = pedestrian?.targetNode ? [pedestrian.targetNode, ...pedestrian.queue] : [];
  const points = pedestrian && ids.length
    ? [new THREE.Vector3(pedestrian.position.x, 0.13, pedestrian.position.z), ...ids.map((id) => new THREE.Vector3(NODES[id].x, 0.13, NODES[id].z))]
    : [];
  routeLine.geometry.dispose();
  routeLine.geometry = new THREE.BufferGeometry().setFromPoints(points);
  if (points.length > 1) routeLine.computeLineDistances();
  routeLine.visible = points.length > 1;
}

function resize() {
  const width = host.clientWidth;
  const height = host.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}
window.addEventListener("resize", resize);
resize();

function updateLabels() {
  const width = host.clientWidth;
  const height = host.clientHeight;
  for (const destination of DESTINATIONS) {
    const node = NODES[destination.node];
    const position = new THREE.Vector3(node.x, 1.9, node.z).project(camera);
    const label = labels.get(destination.id);
    label.style.left = ((position.x + 1) * width / 2) + "px";
    label.style.top = ((1 - position.y) * height / 2) + "px";
    label.style.display = position.z > 1 || position.z < -1 ? "none" : "flex";
  }
  const tables = state.obstacles.find((obstacle) => obstacle.type === "public tables");
  tablesLabel.style.display = tables ? "flex" : "none";
  if (tables) {
    const position = new THREE.Vector3(tables.x, 1.8, tables.z).project(camera);
    tablesLabel.style.left = ((position.x + 1) * width / 2) + "px";
    tablesLabel.style.top = ((1 - position.y) * height / 2) + "px";
    if (position.z > 1 || position.z < -1) tablesLabel.style.display = "none";
  }
  if (locationMarker.visible) {
    const position = new THREE.Vector3(locationMarker.position.x, 1.8, locationMarker.position.z).project(camera);
    locationLabel.style.left = ((position.x + 1) * width / 2) + "px";
    locationLabel.style.top = ((1 - position.y) * height / 2) + "px";
    locationLabel.style.display = position.z > 1 || position.z < -1 ? "none" : "flex";
  }
}

function screenPosition(point) {
  const projected = new THREE.Vector3(point.x, 0.08, point.z).project(camera);
  if (projected.z < -1 || projected.z > 1 || Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1) return null;
  return {
    x: Math.round((projected.x + 1) * host.clientWidth / 2),
    y: Math.round((1 - projected.y) * host.clientHeight / 2)
  };
}

function updatePeopleMeshes() {
  for (const pedestrian of state.pedestrians) {
    const mesh = peopleMeshes.get(pedestrian.id);
    mesh.position.set(pedestrian.position.x, 0.08, pedestrian.position.z);
    mesh.userData.halo.visible = pedestrian.id === selectedId;
    const target = pedestrian.targetNode && NODES[pedestrian.targetNode];
    if (target) mesh.rotation.y = Math.atan2(target.x - pedestrian.position.x, target.z - pedestrian.position.z);
  }
}

function showStatus(message) { $("#status-text").textContent = message; }
function setActiveTab(tab) {
  activeTab = tab;
  for (const name of ["simulation", "location"]) {
    const selected = name === tab;
    $("#" + name + "-view").hidden = !selected;
    $("#" + name + "-tab").classList.toggle("active", selected);
    $("#" + name + "-tab").setAttribute("aria-selected", String(selected));
  }
  if (tab !== "location" && mode === "inspect") setMode(null);
}
function setMode(next) {
  mode = mode === next ? null : next;
  $("#place-button").classList.toggle("active", mode === "add");
  $("#remove-button").classList.toggle("active", mode === "remove");
  $("#inspect-mode-button").classList.toggle("active", mode === "inspect");
  $("#mode-hint").hidden = !mode;
  $("#mode-hint").textContent = mode === "add"
    ? "Click an open spot in the plaza to place a barrier."
    : mode === "remove" ? "Click an obstacle in the plaza to remove it."
    : mode === "inspect" ? "Click any point in the plaza to query its occupants." : "";
  renderer.domElement.style.cursor = mode ? "crosshair" : "grab";
}

function renderPersonOptions() {
  const select = $("#location-person-select");
  select.innerHTML = "";
  for (const pedestrian of state.pedestrians) {
    const option = document.createElement("option");
    option.value = pedestrian.id;
    option.textContent = "Pedestrian " + pedestrian.id.slice(1);
    select.appendChild(option);
  }
  select.value = selectedId;
}

function renderReferenceOptions() {
  const select = $("#reference-select");
  const previous = select.value || "entry";
  select.innerHTML = "";
  for (const landmark of landmarksFor(state)) {
    const option = document.createElement("option");
    option.value = landmark.id;
    option.textContent = landmark.name;
    select.appendChild(option);
  }
  select.value = landmarksFor(state).some((landmark) => landmark.id === previous) ? previous : "entry";
}

function updateLocationUI(selected) {
  if (selected) {
    $("#location-person-select").value = selected.id;
    $("#location-world").textContent = "(" + selected.position.x.toFixed(1) + ", " + selected.position.z.toFixed(1) + ") m";
    const screen = screenPosition(selected.position);
    $("#location-screen").textContent = screen ? "(" + screen.x + ", " + screen.y + ") px" : "Outside view";
    $("#location-semantic").textContent = semanticLocation(selected.position, state);
    const reference = landmarksFor(state).find((landmark) => landmark.id === $("#reference-select").value);
    if (reference) {
      const relative = relativeLocation(selected.position, reference);
      $("#reference-result").innerHTML = "<strong>" + selected.id + "</strong>: " + relative.description +
        '<span class="answer-secondary">Δx ' + relative.eastMeters.toFixed(1) +
        " m east · Δnorth " + relative.northMeters.toFixed(1) + " m</span>";
    }
  }
  if (inspectedPoint) {
    const result = occupantsAt(inspectedPoint, state);
    const screen = screenPosition(inspectedPoint);
    const position = "<strong>(" + inspectedPoint.x.toFixed(1) + ", " + inspectedPoint.z.toFixed(1) + ") m</strong>";
    if (!result.inside) {
      $("#query-result").innerHTML = position + '<span class="answer-secondary">Outside the public plaza boundary.</span>';
    } else {
      const summary = result.occupants.length
        ? result.occupants.slice(0, 5).map((item) => item.type + ": " + item.label + " (" + item.detail + ")").join("<br>")
        : "Open plaza — no mapped object occupies this point.";
      const extra = result.occupants.length > 5 ? "<br>+" + (result.occupants.length - 5) + " more" : "";
      $("#query-result").innerHTML = position + (screen ? " · screen (" + screen.x + ", " + screen.y + ") px" : "") +
        '<span class="answer-secondary">' + summary + extra + "</span>";
    }
  }
  if (resolvedPoint) {
    const screen = screenPosition(resolvedPoint);
    $("#description-result").innerHTML = "<strong>Specific location: (" + resolvedPoint.x.toFixed(1) + ", " +
      resolvedPoint.z.toFixed(1) + ") m</strong>" +
      '<span class="answer-secondary">' + resolvedRule +
      (screen ? "<br>Screen: (" + screen.x + ", " + screen.y + ") px" : "<br>Currently outside the view") + "</span>";
  }
}

function inspectLocation(point) {
  inspectedPoint = { x: Math.round(point.x * 10) / 10, z: Math.round(point.z * 10) / 10 };
  resolvedPoint = null;
  $("#description-result").textContent = "A rule will translate your phrase into a specific walkable point.";
  if (occupantsAt(inspectedPoint, state).inside) setLocationMarker(inspectedPoint, "INSPECTED LOCATION");
  else clearLocationMarker();
  updateLocationUI(state.pedestrians.find((pedestrian) => pedestrian.id === selectedId));
  showStatus("Location query at (" + inspectedPoint.x.toFixed(1) + ", " + inspectedPoint.z.toFixed(1) + ") m.");
}

function runDescription() {
  const result = resolveDescription($("#description-input").value, state);
  if (result.error) {
    resolvedPoint = null;
    $("#description-result").textContent = result.error;
    if (inspectedPoint && occupantsAt(inspectedPoint, state).inside) setLocationMarker(inspectedPoint, "INSPECTED LOCATION");
    else clearLocationMarker();
    return;
  }
  resolvedPoint = result.point;
  resolvedRule = result.rule;
  inspectedPoint = null;
  $("#query-result").textContent = "Choose a point to see what occupies it.";
  setLocationMarker(resolvedPoint, result.semantic.toUpperCase());
  updateLocationUI(state.pedestrians.find((pedestrian) => pedestrian.id === selectedId));
  showStatus("Description resolved to (" + resolvedPoint.x.toFixed(1) + ", " + resolvedPoint.z.toFixed(1) + ") m.");
}

function renderDestinations() {
  const list = $("#destination-list");
  list.innerHTML = "";
  for (const destination of DESTINATIONS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "destination-card";
    button.dataset.destination = destination.id;
    button.style.setProperty("--dest-color", destination.color);
    button.innerHTML = '<span class="dest-symbol">' + destination.short + '</span>' +
      '<span class="dest-copy"><strong>' + destination.name + '</strong><span>' + destination.type + '</span></span>' +
      '<span class="dest-count"><span class="used">0</span>/<span>' + destination.capacity + '</span></span>' +
      '<span class="dest-bar"><span></span></span>';
    button.addEventListener("click", () => {
      if (!selectedId) return showStatus("Select a pedestrian first.");
      selectDestination(state, selectedId, destination.id);
      showStatus(selectedId + " is heading to " + destination.name + ".");
      updateUI();
    });
    list.appendChild(button);
  }
}
function renderObstacleList() {
  const list = $("#obstacle-list");
  list.innerHTML = "";
  $("#obstacle-count").textContent = state.obstacles.length + " IN SPACE";
  for (const obstacle of state.obstacles) {
    const chip = document.createElement("span");
    chip.className = "obstacle-chip";
    chip.appendChild(document.createTextNode(obstacle.id + " · " + obstacle.type));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", "Remove " + obstacle.type + " " + obstacle.id);
    remove.addEventListener("click", () => removeObstacleById(obstacle.id));
    chip.appendChild(remove);
    list.appendChild(chip);
  }
}
function updateUI() {
  const selected = state.pedestrians.find((pedestrian) => pedestrian.id === selectedId);
  $("#total-count").textContent = state.pedestrians.length;
  $("#walking-count").textContent = state.pedestrians.filter((person) => person.state === "walking").length;
  $("#arrived-count").textContent = state.pedestrians.filter((person) => person.state === "arrived").length;
  $("#blocked-count").textContent = blockedEdges(state.obstacles).length;
  $("#play-label").textContent = state.playing ? "Pause walking" : "Start walking";
  $("#play-icon").textContent = state.playing ? "Ⅱ" : "▶";
  $("#live-label").textContent = state.playing ? "LIVE SIMULATION" : "SIMULATION PAUSED";
  $(".live-pill").classList.toggle("paused", !state.playing);
  $("#speed-value").textContent = state.speedMultiplier.toFixed(1) + "×";
  for (const destination of DESTINATIONS) {
    const card = $('[data-destination="' + destination.id + '"]');
    card.querySelector(".used").textContent = state.occupancy[destination.id];
    card.querySelector(".dest-bar > span").style.width = (100 * state.occupancy[destination.id] / destination.capacity) + "%";
    card.classList.toggle("selected", selected?.destinationId === destination.id);
  }
  const detail = $("#person-detail");
  if (selected) {
    const destination = DESTINATIONS.find((item) => item.id === selected.destinationId);
    detail.innerHTML = '<div class="person-main"><div class="person-avatar">' + selected.id + '</div><div><strong>Pedestrian ' + selected.id.slice(1) +
      '</strong><span>' + (destination ? "To " + destination.name : "Choose a destination") + '</span></div></div>' +
      '<div class="person-meta"><span>STATUS <strong>' + selected.state.toUpperCase() + '</strong></span>' +
      '<span>SPEED <strong>' + selected.speed.toFixed(2) + ' m/s</strong></span></div>';
  } else detail.textContent = "Click a pedestrian in the plaza.";
  updateLocationUI(selected);
}

function removeObstacleById(id) {
  if (removeObstacle(state, id)) {
    refreshObstacles();
    updateUI();
    showStatus("Obstacle " + id + " removed. Routes recalculated.");
  }
  if (mode === "remove") setMode(null);
}

$("#play-button").addEventListener("click", () => {
  state.playing = !state.playing;
  showStatus(state.playing ? "Walking resumed." : "Walking paused. Positions and routes are preserved.");
  updateUI();
});
$("#add-person-button").addEventListener("click", () => {
  const person = createPedestrian(state);
  if (!person) return showStatus("No unoccupied walkable starting point is available.");
  selectedId = person.id;
  refreshPeople();
  renderPersonOptions();
  updateUI();
  showStatus(person.id + " created. Open Simulation to choose a destination.");
});
$("#place-button").addEventListener("click", () => setMode("add"));
$("#remove-button").addEventListener("click", () => setMode("remove"));
$("#reset-button").addEventListener("click", () => {
  state = createInitialState();
  selectedId = state.pedestrians[0].id;
  inspectedPoint = null;
  resolvedPoint = null;
  clearLocationMarker();
  $("#query-result").textContent = "Choose a point to see what occupies it.";
  $("#description-result").textContent = "A rule will translate your phrase into a specific walkable point.";
  $("#speed-range").value = "1";
  if (mode) setMode(mode);
  refreshPeople();
  refreshObstacles();
  renderPersonOptions();
  updateUI();
  showStatus("The original plaza layout and simulation have been restored.");
});
$("#speed-range").addEventListener("input", (event) => {
  state.speedMultiplier = Number(event.target.value);
  updateUI();
});
$("#simulation-tab").addEventListener("click", () => setActiveTab("simulation"));
$("#location-tab").addEventListener("click", () => setActiveTab("location"));
$("#location-person-select").addEventListener("change", (event) => {
  selectedId = event.target.value;
  updateUI();
  showStatus(selectedId + " selected for location queries.");
});
$("#reference-select").addEventListener("change", () => updateUI());
$("#inspect-mode-button").addEventListener("click", () => setMode("inspect"));
$("#query-button").addEventListener("click", () => {
  const rawX = $("#query-x").value.trim();
  const rawZ = $("#query-z").value.trim();
  const x = Number(rawX);
  const z = Number(rawZ);
  if (!rawX || !rawZ || !Number.isFinite(x) || !Number.isFinite(z)) {
    $("#query-result").textContent = "Enter numeric X and Z coordinates.";
    return;
  }
  inspectLocation({ x, z });
});
$("#resolve-button").addEventListener("click", runDescription);
$("#description-input").addEventListener("keydown", (event) => {
  if (event.key === "Enter") runDescription();
});
for (const example of document.querySelectorAll("[data-example]")) {
  example.addEventListener("click", () => {
    $("#description-input").value = example.dataset.example;
    runDescription();
  });
}

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.08);
function objectTag(object, key) {
  let current = object;
  while (current) {
    if (current.userData[key]) return current.userData[key];
    current = current.parent;
  }
  return null;
}
function handleSceneClick(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  if (mode === "add") {
    const point = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(groundPlane, point)) {
      const obstacle = addObstacle(state, point.x, point.z);
      if (obstacle) {
        refreshObstacles();
        updateUI();
        showStatus(obstacle.id + " added. Pedestrians have checked their routes.");
        setMode(null);
      } else showStatus("Choose a clear spot inside the plaza, away from people and destinations.");
    }
    return;
  }
  if (mode === "remove") {
    const hits = raycaster.intersectObjects([...obstacleMeshes.values()], true);
    const id = hits.length ? objectTag(hits[0].object, "obstacleId") : null;
    if (id) removeObstacleById(id);
    else showStatus("Click a visible obstacle to remove it.");
    return;
  }
  if (mode === "inspect") {
    const point = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(groundPlane, point)) {
      inspectLocation({ x: point.x, z: point.z });
      $("#query-x").value = inspectedPoint.x.toFixed(1);
      $("#query-z").value = inspectedPoint.z.toFixed(1);
    }
    return;
  }
  const personHits = raycaster.intersectObjects([...peopleMeshes.values()], true);
  if (personHits.length) {
    selectedId = objectTag(personHits[0].object, "pedestrianId");
    updateUI();
    showStatus(selectedId + " selected. Open Simulation to choose a destination.");
    return;
  }
  const destinationHits = raycaster.intersectObjects(destinationMeshes, false);
  if (destinationHits.length && selectedId) {
    const id = destinationHits[0].object.userData.destinationId;
    selectDestination(state, selectedId, id);
    updateUI();
    showStatus(selectedId + " is heading to " + DESTINATIONS.find((item) => item.id === id).name + ".");
  }
}
renderer.domElement.addEventListener("pointerdown", (event) => {
  pointerStart = { x: event.clientX, y: event.clientY };
});
renderer.domElement.addEventListener("pointerup", (event) => {
  if (!pointerStart) return;
  const movement = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
  pointerStart = null;
  if (movement < 5) handleSceneClick(event);
});

renderDestinations();
refreshPeople();
refreshObstacles();
renderPersonOptions();
updateUI();
function animate(now) {
  requestAnimationFrame(animate);
  tick(state, (now - lastFrame) / 1000);
  lastFrame = now;
  controls.update();
  updatePeopleMeshes();
  updateRouteLine();
  updateLabels();
  if (now - lastUI > 250) {
    updateUI();
    lastUI = now;
  }
  renderer.render(scene, camera);
}
requestAnimationFrame(animate);
