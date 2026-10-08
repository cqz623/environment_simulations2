import { BOUNDS, DESTINATIONS, EDGES, NODES, segmentDistance, segmentIsOpen } from "./simulation.js";

// x grows east, z grows south. Screen pixels are derived from these world coordinates.
const LANDMARK_DEFINITIONS = [
  { id: "fountain", name: "Fountain", aliases: ["fountain", "water feature"], obstacleId: "O4", x: 3.2, z: 6.4 },
  { id: "entry", name: "West entrance", aliases: ["west entrance", "entrance", "entry", "gate"], node: "D" },
  { id: "bench", name: "Bench garden", aliases: ["bench garden", "benches", "bench"], node: "G" },
  { id: "cafe", name: "Plaza café", aliases: ["plaza cafe", "cafe", "coffee"], node: "C" },
  { id: "shade", name: "Shaded court", aliases: ["shaded court", "shade", "canopy"], node: "I" }
];

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const round = (value) => Math.round(value * 10) / 10;
const normalize = (text) => text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

export function landmarksFor(state) {
  return LANDMARK_DEFINITIONS.filter((landmark) =>
    !landmark.obstacleId || state.obstacles.some((obstacle) => obstacle.id === landmark.obstacleId)
  ).map((landmark) => ({
    ...landmark,
    ...(landmark.node ? NODES[landmark.node] : {})
  }));
}

export function compassDirection(point, reference) {
  const dx = point.x - reference.x;
  const dz = point.z - reference.z;
  if (Math.hypot(dx, dz) < 0.75) return "at";
  const horizontal = Math.abs(dx) > 0.7 ? (dx > 0 ? "east" : "west") : "";
  const vertical = Math.abs(dz) > 0.7 ? (dz < 0 ? "north" : "south") : "";
  if (horizontal && vertical) {
    if (Math.abs(dx) > Math.abs(dz) * 2) return horizontal;
    if (Math.abs(dz) > Math.abs(dx) * 2) return vertical;
    return vertical + "-" + horizontal;
  }
  return horizontal || vertical || "at";
}

export function relativeLocation(point, reference) {
  const meters = round(distance(point, reference));
  const direction = compassDirection(point, reference);
  return {
    distance: meters,
    direction,
    eastMeters: round(point.x - reference.x),
    northMeters: round(reference.z - point.z),
    description: direction === "at" ? "At " + reference.name : meters + " m " + direction + " of " + reference.name
  };
}

export function semanticLocation(point, state) {
  const landmarks = landmarksFor(state);
  const nearest = landmarks.reduce((best, current) =>
    !best || distance(point, current) < distance(point, best) ? current : best, null
  );
  if (!nearest) return "Within the public plaza";
  const meters = distance(point, nearest);
  if (meters < 1.2) return "At " + nearest.name;
  if (meters < 4) return "Near " + nearest.name;
  return relativeLocation(point, nearest).description;
}

export function occupantsAt(point, state) {
  if (point.x < BOUNDS.minX || point.x > BOUNDS.maxX ||
      point.z < BOUNDS.minZ || point.z > BOUNDS.maxZ) {
    return { inside: false, occupants: [] };
  }
  const occupants = [];
  for (const pedestrian of state.pedestrians) {
    if (distance(point, pedestrian.position) <= 0.7) {
      occupants.push({ type: "Pedestrian", label: pedestrian.id, detail: pedestrian.state, distance: round(distance(point, pedestrian.position)) });
    }
  }
  for (const obstacle of state.obstacles) {
    if (distance(point, obstacle) <= obstacle.radius) {
      occupants.push({ type: "Obstacle", label: obstacle.type === "fountain" ? "Fountain" : obstacle.id + " " + obstacle.type, detail: "inside footprint", distance: round(distance(point, obstacle)) });
    }
  }
  for (const destination of DESTINATIONS) {
    const position = NODES[destination.node];
    if (distance(point, position) <= 1.15) {
      occupants.push({ type: "Destination", label: destination.name, detail: state.occupancy[destination.id] + "/" + destination.capacity + " occupants", distance: round(distance(point, position)) });
    }
  }
  for (const [a, b] of EDGES) {
    if (segmentDistance(point, NODES[a], NODES[b]) <= 0.92) {
      occupants.push({ type: "Path", label: a + "–" + b, detail: segmentIsOpen(NODES[a], NODES[b], state.obstacles) ? "open" : "blocked", distance: round(segmentDistance(point, NODES[a], NODES[b])) });
    }
  }
  return { inside: true, occupants };
}

function findMention(text, landmarks) {
  return landmarks.find((landmark) => landmark.aliases.some((alias) => text.includes(alias)));
}

function walkableSamples(state) {
  const samples = [];
  for (const [a, b] of EDGES) {
    if (!segmentIsOpen(NODES[a], NODES[b], state.obstacles)) continue;
    const start = NODES[a], end = NODES[b];
    const count = Math.ceil(distance(start, end) / 0.5);
    for (let index = 0; index <= count; index++) {
      const fraction = index / count;
      const point = {
        x: start.x + (end.x - start.x) * fraction,
        z: start.z + (end.z - start.z) * fraction
      };
      if (state.obstacles.some((obstacle) => distance(point, obstacle) <= obstacle.radius + 0.3)) continue;
      samples.push(point);
    }
  }
  return samples;
}

function chooseSample(state, target, predicate) {
  const candidates = walkableSamples(state).filter(predicate);
  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    const crowdA = state.pedestrians.some((person) => distance(person.position, a) < 0.7) ? 2 : 0;
    const crowdB = state.pedestrians.some((person) => distance(person.position, b) < 0.7) ? 2 : 0;
    return distance(a, target) + crowdA - distance(b, target) - crowdB;
  });
  return { x: round(candidates[0].x), z: round(candidates[0].z) };
}

export function resolveDescription(description, state) {
  const text = normalize(description);
  const landmarks = landmarksFor(state);
  if (!text) return { error: "Enter a description such as “near the entrance”." };
  if (text.includes("between")) {
    const names = landmarks.filter((landmark) => landmark.aliases.some((alias) => text.includes(alias)));
    if (names.length < 2) return { error: "“Between” needs two known places, such as “between the fountain and bench garden”." };
    const [first, second] = names;
    const target = { x: (first.x + second.x) / 2, z: (first.z + second.z) / 2 };
    const point = chooseSample(state, target, (candidate) => distance(candidate, target) <= 4);
    if (!point) return { error: "No open path is close to the midpoint of those places." };
    return { point, rule: "Closest open path to the midpoint of " + first.name + " and " + second.name + ".", semantic: "Between " + first.name + " and " + second.name };
  }
  const landmark = findMention(text, landmarks);
  if (!landmark) return { error: "Choose a known place: fountain, entrance, bench garden, café, or shaded court." };
  const directional = text.match(/\b(north|south|east|west)(?:\s*[- ]\s*(east|west))?\s+of\b/);
  if (directional) {
    const primary = directional[1];
    const secondary = directional[2];
    const dx = (primary === "east" || secondary === "east" ? 1 : 0) - (primary === "west" || secondary === "west" ? 1 : 0);
    const dz = (primary === "south" ? 1 : 0) - (primary === "north" ? 1 : 0);
    const target = { x: landmark.x + dx * 3.5, z: landmark.z + dz * 3.5 };
    const point = chooseSample(state, target, (candidate) => {
      const east = candidate.x - landmark.x;
      const north = landmark.z - candidate.z;
      if (dx && east * dx < 1.2) return false;
      if (dz && north * -dz < 1.2) return false;
      return distance(candidate, landmark) <= 7;
    });
    if (!point) return { error: "No open path lies " + primary + " of " + landmark.name + " within the plaza." };
    return { point, rule: "Open path at least 1.2 m " + primary + " of " + landmark.name + ".", semantic: primary + (secondary ? "-" + secondary : "") + " of " + landmark.name };
  }
  if (/\b(near|beside|at|around)\b/.test(text)) {
    const beside = /\bbeside\b/.test(text);
    const target = { x: landmark.x + (beside ? 2.2 : 1.8), z: landmark.z };
    const point = chooseSample(state, target, (candidate) => {
      const meters = distance(candidate, landmark);
      return meters >= 0.8 && meters <= (beside ? 3 : 4);
    });
    if (!point) return { error: "No open path is close enough to " + landmark.name + "." };
    return { point, rule: "A walkable point within " + (beside ? "3" : "4") + " m of " + landmark.name + ".", semantic: (beside ? "Beside " : "Near ") + landmark.name };
  }
  return { error: "Use near, beside, north/south/east/west of, or between two places." };
}
