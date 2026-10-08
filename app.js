import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  BOUNDS, NODES, EDGES, DESTINATIONS, blockedEdges,
  createInitialState, createPedestrian, selectDestination,
  addObstacle, removeObstacle, tick
} from "./simulation.js";
import { landmarksFor, occupantsAt, relativeLocation, resolveDescription, semanticLocation } from "./location.js";

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
let activeTab = "simulation";

const scene = new THREE.Scene();
scene.background = new THREE.Color("#dce1dd");
scene.fog = new THREE.Fog("#dce1dd", 57, 105);
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
  new THREE.MeshStandardMaterial({ color: "#cbd3cf", roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.31;
ground.receiveShadow = true;
scene.add(ground);

function pavingTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const context = canvas.getContext("2d");
  context.fillStyle = "#e9e3d7";
  context.fillRect(0, 0, 128, 128);
  context.strokeStyle = "#d6d0c5";
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
  new THREE.MeshStandardMaterial({ color: "#e9e3d7", roughness: 0.96 })
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

const siteObjects = new THREE.Group();
scene.add(siteObjects);
for (const [x, z, w, d, h] of [
  [-20, -12, 7, 11, 5.5], [-20, 4, 7, 10, 4.5], [-19, 17, 8, 7, 6],
  [20, -15, 7, 9, 5], [21, 0, 9, 13, 7], [18, 18, 8, 8, 5],
  [-8, -21, 10, 8, 3.8], [7, -21, 13, 8, 4.5], [-7, 21, 13, 8, 5.5], [8, 22, 10, 7, 4.1]
]) {
  box(siteObjects, w, h, d, x, h / 2 - 0.25, z, "#b5c1bb");
  box(siteObjects, w + 0.25, 0.22, d + 0.25, x, h - 0.12, z, "#879c96");
}
for (const [x, z, scale] of [[-15.7,-10,1],[-16.2,2,.8],[-16,12,1.05],[16.2,-8,.9],[16,8,1],[-9,15.5,.9],[4,15.7,.8]]) {
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
    material("#cfc6b7", 1)
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
    pathMeshes[index].material.color.set(closed ? "#baaa9d" : "#d8cfc0");
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
const fountainLabel = document.createElement("div");
fountainLabel.className = "map-label";
fountainLabel.style.setProperty("--dest-color", "#779e9a");
fountainLabel.innerHTML = '<span class="map-label-dot">✦</span><strong>Fountain</strong>';
labelsHost.appendChild(fountainLabel);

// Places are built around the arrival markers so every destination remains reachable.
const architecture = new THREE.Group();
scene.add(architecture);
// West entrance: twin masonry gates.
box(architecture, 0.52, 2.25, 1.2, -12.8, 1.12, -1.7, "#9ca9a2");
box(architecture, 0.52, 2.25, 1.2, -12.8, 1.12, 1.7, "#9ca9a2");
box(architecture, 0.65, 0.32, 4.5, -12.8, 2.32, 0, "#738981");
// Bench garden.
for (const z of [11.2, 12.4]) {
  box(architecture, 2.4, 0.15, 0.65, -10, 0.66, z, "#a3755b");
  box(architecture, 2.4, 0.65, 0.12, -10, 1.04, z + 0.28, "#a3755b");
  for (const x of [-10.9, -9.1]) box(architecture, 0.12, 0.58, 0.55, x, 0.33, z, "#566a62");
}
tree(architecture, -12.2, 11.7, 0.92);
// Café: a small kiosk and outdoor tables.
box(architecture, 3.3, 1.9, 1.55, 10.7, 0.96, -12.3, "#b69b80");
box(architecture, 4.0, 0.16, 2.15, 10.7, 2.02, -12.3, "#506e67");
box(architecture, 2.1, 0.7, 0.16, 10.7, 0.88, -11.45, "#dfc5a5");
for (const [x, z] of [[7.3,-11.2],[8.4,-12.4]]) {
  cylinder(architecture, 0.48, 0.48, 0.08, x, 0.75, z, "#e0d0b6", 24);
  cylinder(architecture, 0.055, 0.055, 0.7, x, 0.36, z, "#6d786d");
}
// Shade structure.
for (const [x,z] of [[8.1,11.1],[12.3,11.1],[8.1,13],[12.3,13]]) {
  cylinder(architecture, 0.07, 0.07, 2.3, x, 1.15, z, "#667b70");
}
box(architecture, 4.7, 0.13, 2.5, 10.2, 2.34, 12.05, "#809883");
for (const x of [8.6, 10.2, 11.8]) {
  box(architecture, 0.16, 0.05, 2.55, x, 2.45, 12.05, "#acc0a0");
}

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
  } else if (obstacle.type === "building") {
    box(group, 2.05, 1.55, 2.05, 0, 0.79, 0, "#c19d81");
    box(group, 2.35, 0.22, 2.35, 0, 1.65, 0, "#6b8177");
    box(group, 1.15, 0.57, 0.08, 0, 0.91, -1.07, "#49635d");
  } else if (obstacle.type === "fountain") {
    cylinder(group, 1.05, 1.12, 0.34, 0, 0.18, 0, "#a1aaa0", 32);
    cylinder(group, 0.82, 0.82, 0.035, 0, 0.38, 0, "#739e9d", 32);
    cylinder(group, 0.17, 0.25, 0.55, 0, 0.65, 0, "#c4c6b2", 20);
    sphere(group, 0.17, 0, 1.0, 0, "#b2d3cd", 2);
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
  const fountain = state.obstacles.find((obstacle) => obstacle.type === "fountain");
  fountainLabel.style.display = fountain ? "flex" : "none";
  if (fountain) {
    const position = new THREE.Vector3(fountain.x, 1.8, fountain.z).project(camera);
    fountainLabel.style.left = ((position.x + 1) * width / 2) + "px";
    fountainLabel.style.top = ((1 - position.y) * height / 2) + "px";
    if (position.z > 1 || position.z < -1) fountainLabel.style.display = "none";
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
  const previous = select.value || "fountain";
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
  showStatus(person.id + " created. Select a destination on the right.");
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
    showStatus(selectedId + " selected. Choose a destination on the right.");
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
