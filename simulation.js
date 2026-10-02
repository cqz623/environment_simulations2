export const BOUNDS = { minX: -14, maxX: 14, minZ: -14, maxZ: 14 };

export const NODES = {
  A: { x: -10, z: -9 }, B: { x: 0, z: -9 }, C: { x: 10, z: -9 },
  D: { x: -10, z: 0 }, E: { x: 0, z: 0 }, F: { x: 10, z: 0 },
  G: { x: -10, z: 9 }, H: { x: 0, z: 9 }, I: { x: 10, z: 9 }
};

export const EDGES = [
  ["A", "B"], ["B", "C"], ["D", "E"], ["E", "F"],
  ["G", "H"], ["H", "I"], ["A", "D"], ["D", "G"],
  ["B", "E"], ["E", "H"], ["C", "F"], ["F", "I"],
  ["B", "D"], ["B", "F"], ["D", "H"], ["E", "I"], ["H", "F"]
];

export const DESTINATIONS = [
  { id: "entry", name: "West entrance", type: "entrance", node: "D", capacity: 8, color: "#648d8a", short: "01" },
  { id: "bench", name: "Bench garden", type: "bench", node: "G", capacity: 4, color: "#b98862", short: "02" },
  { id: "cafe", name: "Plaza café", type: "café", node: "C", capacity: 5, color: "#b96e53", short: "03" },
  { id: "shade", name: "Shaded court", type: "shaded area", node: "I", capacity: 6, color: "#829b72", short: "04" }
];

const START_OBSTACLES = [
  { id: "O1", type: "planter", x: -5, z: -4.3, radius: 1.35, permanent: true },
  { id: "O2", type: "planter", x: 5, z: 4.3, radius: 1.35, permanent: true },
  { id: "O3", type: "building", x: 4.8, z: -4.7, radius: 1.3, permanent: true }
];

const START_PEDESTRIANS = [
  ["A", "shade"], ["B", "bench"], ["D", "cafe"], ["E", "entry"],
  ["F", "bench"], ["H", "cafe"], ["A", "entry"], ["B", "shade"],
  ["E", "cafe"], ["F", "entry"], ["H", "bench"], ["D", "shade"]
];

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const destinationById = (id) => DESTINATIONS.find((item) => item.id === id);

export function segmentDistance(point, a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const lengthSquared = dx * dx + dz * dz;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / lengthSquared)) : 0;
  return Math.hypot(point.x - (a.x + t * dx), point.z - (a.z + t * dz));
}

export function segmentIsOpen(a, b, obstacles) {
  return obstacles.every((obstacle) => segmentDistance(obstacle, a, b) > obstacle.radius + 0.28);
}

export function blockedEdges(obstacles) {
  return EDGES.filter(([a, b]) => !segmentIsOpen(NODES[a], NODES[b], obstacles));
}

function shortestPath(start, end, obstacles) {
  const costs = Object.fromEntries(Object.keys(NODES).map((id) => [id, Infinity]));
  const previous = {};
  const unseen = new Set(Object.keys(NODES));
  costs[start] = 0;
  while (unseen.size) {
    let current = null;
    for (const id of unseen) {
      if (current === null || costs[id] < costs[current]) current = id;
    }
    if (current === null || costs[current] === Infinity) break;
    if (current === end) break;
    unseen.delete(current);
    for (const [a, b] of EDGES) {
      const neighbor = a === current ? b : b === current ? a : null;
      if (!neighbor || !unseen.has(neighbor) || !segmentIsOpen(NODES[a], NODES[b], obstacles)) continue;
      const cost = costs[current] + distance(NODES[current], NODES[neighbor]);
      if (cost < costs[neighbor]) {
        costs[neighbor] = cost;
        previous[neighbor] = current;
      }
    }
  }
  if (!Number.isFinite(costs[end])) return null;
  const path = [end];
  while (path[0] !== start) path.unshift(previous[path[0]]);
  return { path, cost: costs[end] };
}

export function routeFor(pedestrian, destinationId, obstacles) {
  const destination = destinationById(destinationId);
  if (!destination) return null;
  const candidates = pedestrian.targetNode
    ? [pedestrian.anchorNode, pedestrian.targetNode]
    : [pedestrian.anchorNode];
  let best = null;
  for (const candidate of new Set(candidates)) {
    if (!segmentIsOpen(pedestrian.position, NODES[candidate], obstacles)) continue;
    const leg = shortestPath(candidate, destination.node, obstacles);
    if (!leg) continue;
    const cost = distance(pedestrian.position, NODES[candidate]) + leg.cost;
    if (!best || cost < best.cost) best = { path: leg.path, cost };
  }
  return best?.path ?? null;
}

function arrive(state, pedestrian) {
  const destination = destinationById(pedestrian.destinationId);
  if (!destination) return;
  if (state.occupancy[destination.id] >= destination.capacity) {
    pedestrian.state = "waiting";
    return;
  }
  state.occupancy[destination.id] += 1;
  pedestrian.state = "arrived";
  pedestrian.targetNode = null;
  pedestrian.queue = [];
}

export function planPedestrian(state, pedestrian) {
  if (!pedestrian.destinationId) {
    pedestrian.state = "idle";
    pedestrian.targetNode = null;
    pedestrian.queue = [];
    return;
  }
  const path = routeFor(pedestrian, pedestrian.destinationId, state.obstacles);
  if (!path) {
    pedestrian.state = "waiting";
    pedestrian.targetNode = null;
    pedestrian.queue = [];
    return;
  }
  const remaining = [...path];
  if (distance(pedestrian.position, NODES[remaining[0]]) < 0.01) {
    pedestrian.anchorNode = remaining.shift();
  }
  pedestrian.targetNode = remaining.shift() ?? null;
  pedestrian.queue = remaining;
  if (!pedestrian.targetNode) arrive(state, pedestrian);
  else pedestrian.state = "walking";
}

export function selectDestination(state, pedestrianId, destinationId) {
  const pedestrian = state.pedestrians.find((item) => item.id === pedestrianId);
  if (!pedestrian || !destinationById(destinationId)) return false;
  if (pedestrian.state === "arrived" && pedestrian.destinationId) {
    state.occupancy[pedestrian.destinationId] = Math.max(0, state.occupancy[pedestrian.destinationId] - 1);
  }
  pedestrian.destinationId = destinationId;
  planPedestrian(state, pedestrian);
  return true;
}

export function createPedestrian(state, nodeId) {
  const choices = ["A", "B", "E", "F", "H", "D"];
  const preferred = NODES[nodeId] ? nodeId : choices[(state.nextPedestrian - 1) % choices.length];
  const nodeOrder = [preferred, ...Object.keys(NODES).filter((id) => id !== preferred)];
  let spawn = null;
  for (const id of nodeOrder) {
    const candidates = [{ ...NODES[id] }];
    for (const [a, b] of EDGES) {
      const other = a === id ? b : b === id ? a : null;
      if (!other || !segmentIsOpen(NODES[id], NODES[other], state.obstacles)) continue;
      for (const fraction of [0.18, 0.36, 0.56]) {
        candidates.push({
          x: NODES[id].x + (NODES[other].x - NODES[id].x) * fraction,
          z: NODES[id].z + (NODES[other].z - NODES[id].z) * fraction
        });
      }
    }
    const position = candidates.find((candidate) =>
      segmentIsOpen(candidate, NODES[id], state.obstacles) &&
      state.pedestrians.every((person) => distance(person.position, candidate) > 0.7)
    );
    if (position) {
      spawn = { node: id, position };
      break;
    }
  }
  if (!spawn) return null;
  const pedestrian = {
    id: "P" + String(state.nextPedestrian++).padStart(2, "0"),
    position: spawn.position,
    speed: 0.85 + ((state.nextPedestrian * 7) % 7) * 0.085,
    destinationId: null,
    state: "idle",
    anchorNode: spawn.node,
    targetNode: null,
    queue: []
  };
  state.pedestrians.push(pedestrian);
  return pedestrian;
}

export function addObstacle(state, x, z) {
  if (x <= BOUNDS.minX + 1.2 || x >= BOUNDS.maxX - 1.2 ||
      z <= BOUNDS.minZ + 1.2 || z >= BOUNDS.maxZ - 1.2) return null;
  if (state.pedestrians.some((pedestrian) => distance(pedestrian.position, { x, z }) < 1.8)) return null;
  if (state.obstacles.some((obstacle) => distance(obstacle, { x, z }) < obstacle.radius + 1.3)) return null;
  if (DESTINATIONS.some((destination) => distance(NODES[destination.node], { x, z }) < 1.8)) return null;
  const obstacle = { id: "O" + state.nextObstacle++, type: "temporary barrier", x, z, radius: 1.22, permanent: false };
  state.obstacles.push(obstacle);
  for (const pedestrian of state.pedestrians) {
    if (pedestrian.destinationId && pedestrian.state !== "arrived") planPedestrian(state, pedestrian);
  }
  return obstacle;
}

export function removeObstacle(state, obstacleId) {
  const index = state.obstacles.findIndex((item) => item.id === obstacleId);
  if (index < 0) return false;
  state.obstacles.splice(index, 1);
  for (const pedestrian of state.pedestrians) {
    if (pedestrian.destinationId && pedestrian.state !== "arrived") planPedestrian(state, pedestrian);
  }
  return true;
}

export function tick(state, delta) {
  if (!state.playing) return;
  const elapsed = Math.min(delta, 0.06) * state.speedMultiplier;
  state.time += elapsed;
  for (const pedestrian of state.pedestrians) {
    if (pedestrian.state === "waiting" && pedestrian.targetNode) {
      const destination = destinationById(pedestrian.destinationId);
      if (state.occupancy[destination.id] < destination.capacity) pedestrian.state = "walking";
    }
    if (pedestrian.state !== "walking" || !pedestrian.targetNode) continue;
    const target = NODES[pedestrian.targetNode];
    const remaining = distance(pedestrian.position, target);
    const destination = destinationById(pedestrian.destinationId);
    const finalLeg = pedestrian.targetNode === destination.node && pedestrian.queue.length === 0;
    if (finalLeg && state.occupancy[destination.id] >= destination.capacity && remaining <= 1.2) {
      pedestrian.state = "waiting";
      continue;
    }
    let step = Math.min(remaining, pedestrian.speed * elapsed);
    if (finalLeg && state.occupancy[destination.id] >= destination.capacity) step = Math.min(step, Math.max(0, remaining - 1.2));
    if (remaining > 0) {
      pedestrian.position.x += (target.x - pedestrian.position.x) * (step / remaining);
      pedestrian.position.z += (target.z - pedestrian.position.z) * (step / remaining);
    }
    pedestrian.position.x = Math.max(BOUNDS.minX, Math.min(BOUNDS.maxX, pedestrian.position.x));
    pedestrian.position.z = Math.max(BOUNDS.minZ, Math.min(BOUNDS.maxZ, pedestrian.position.z));
    if (distance(pedestrian.position, target) < 0.015) {
      pedestrian.position = { ...target };
      pedestrian.anchorNode = pedestrian.targetNode;
      pedestrian.targetNode = pedestrian.queue.shift() ?? null;
      if (!pedestrian.targetNode) arrive(state, pedestrian);
    }
  }
}

export function createInitialState() {
  const state = {
    pedestrians: [],
    obstacles: START_OBSTACLES.map((obstacle) => ({ ...obstacle })),
    occupancy: Object.fromEntries(DESTINATIONS.map((destination) => [destination.id, 0])),
    nextPedestrian: 1,
    nextObstacle: 4,
    playing: true,
    speedMultiplier: 1,
    time: 0
  };
  for (const [node, destination] of START_PEDESTRIANS) {
    const pedestrian = createPedestrian(state, node);
    selectDestination(state, pedestrian.id, destination);
  }
  return state;
}
