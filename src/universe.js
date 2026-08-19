import { uid, normalizeUrl, nameFromUrl, clamp } from "./math.js";
import { loadUniverse, saveUniverse } from "./storage.js";
import { starterUniverse, EVOLUTION, DEFAULT_CONSTELLATIONS, starterConstellations } from "./defaults.js";

export const ORBIT_LANES = 6;

export function snapOrbit(orbit) {
  const i = Math.round(clamp(orbit, 0, 1) * (ORBIT_LANES - 1));
  return i / (ORBIT_LANES - 1);
}

let data = starterUniverse();
let saveTimer = 0;
const listeners = new Set();

function emit() {
  for (const fn of listeners) fn(data);
  scheduleSave();
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveUniverse(snapshot());
  }, 250);
}

export function snapshot() {
  const copy = JSON.parse(JSON.stringify(data));
  for (const w of copy.worlds) {
    delete w.arriving;
    delete w.arrivedBurst;
  }
  return copy;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getState() {
  return data;
}

export async function bootUniverse() {
  const saved = await loadUniverse();
  if (saved && (saved.version === 1 || saved.version === 2) && Array.isArray(saved.worlds)) {
    data = migrate(saved);
  } else {
    data = starterUniverse();
    await saveUniverse(snapshot());
  }
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    data.settings.reducedMotion = true;
  }
  return data;
}

function seedIds(worlds) {
  return worlds
    .map((w) => w.id)
    .slice()
    .sort()
    .join(",");
}

function applyStarterGroups(worlds, constellations) {
  const byId = Object.fromEntries(constellations.map((c) => [c.id, c]));
  if (byId.coding) {
    byId.coding.orbit = 0.58;
    byId.coding.phase = 0.85;
  }
  if (byId.entertainment) {
    byId.entertainment.orbit = 0.82;
    byId.entertainment.phase = 2.15;
  }
  if (byId.school) {
    byId.school.orbit = 0.94;
    byId.school.phase = 4.1;
  }
  const assign = {
    "seed:github": { constellationId: "coding", localPhase: 0.2, orbit: 0.58 },
    "seed:hackclub": { constellationId: "coding", localPhase: 2.2, orbit: 0.58 },
    "seed:chatgpt": { constellationId: "coding", localPhase: 4.3, orbit: 0.58 },
    "seed:youtube": { constellationId: "entertainment", orbit: 0.78, phase: 2.15 },
    "seed:wikipedia": { constellationId: "school", orbit: 0.92, phase: 4.1 },
  };
  for (const world of worlds) {
    const patch = assign[world.id];
    if (patch) Object.assign(world, patch);
  }
}

function migrate(saved) {
  const next = {
    version: 2,
    settings: {
      engine: "google",
      showOrbits: true,
      showLabels: true,
      reducedMotion: false,
      ...saved.settings,
    },
    constellations: saved.constellations?.length
      ? saved.constellations
      : starterConstellations(),
    worlds: saved.worlds.map((w) => ({
      hue: null,
      scale: 1,
      constellationId: null,
      localPhase: 0,
      seeded: false,
      createdAt: Date.now(),
      lastVisit: null,
      ...w,
    })),
  };
  const original =
    "seed:chatgpt,seed:github,seed:hackclub,seed:wikipedia,seed:youtube";
  if (saved.version === 1 && seedIds(next.worlds) === original) {
    if (!next.constellations.length) next.constellations = starterConstellations();
    applyStarterGroups(next.worlds, next.constellations);
  }
  return next;
}

export function persistNow() {
  return saveUniverse(snapshot());
}

export function replaceUniverse(next) {
  if (!next || (next.version !== 1 && next.version !== 2) || !Array.isArray(next.worlds)) {
    throw new Error("This file is not a STARLING universe.");
  }
  data = migrate(next);
  emit();
  return persistNow();
}

export function resetUniverse() {
  data = starterUniverse();
  emit();
}

export function updateSettings(patch) {
  data.settings = { ...data.settings, ...patch };
  emit();
}

export function worldById(id) {
  return data.worlds.find((w) => w.id === id) || null;
}

export function constellationById(id) {
  return data.constellations.find((c) => c.id === id) || null;
}

export function worldsIn(constellationId) {
  return data.worlds.filter((w) => w.constellationId === constellationId);
}

export function grouped(constellationId) {
  return worldsIn(constellationId).length >= 2;
}

export function addWorld({ url, name, icon, constellationId, constellationName }) {
  const href = normalizeUrl(url);
  const existing = data.worlds.find((w) => w.url === href);
  if (existing) return existing;

  let cid = constellationId || null;
  if (!cid && constellationName) cid = ensureConstellation(constellationName);

  const orbiting = data.worlds.filter((w) => w.constellationId === cid).length;
  const world = {
    id: uid("world"),
    name: name?.trim() || nameFromUrl(href),
    url: href,
    icon: icon?.trim() || "✦",
    visits: 0,
    orbit: nextFreeOrbit(),
    phase: Math.random() * Math.PI * 2,
    hue: null,
    scale: 1,
    constellationId: cid,
    localPhase: orbiting * 2.1,
    seeded: false,
    createdAt: Date.now(),
    lastVisit: null,
    arriving: 1,
    arrivedBurst: false,
  };
  data.worlds.push(world);
  emit();
  return world;
}

function nextFreeOrbit() {
  const used = data.worlds
    .filter((w) => !w.constellationId || worldsIn(w.constellationId).length < 2)
    .map((w) => w.orbit);
  for (let i = 0; i < 8; i++) {
    const slot = (i + 0.5) / 8;
    if (!used.some((o) => Math.abs(o - slot) < 0.08)) return slot;
  }
  return Math.random();
}

export function ensureConstellation(name) {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const key = trimmed.toLowerCase();
  const found = data.constellations.find((c) => c.name.toLowerCase() === key);
  if (found) return found.id;
  const preset = DEFAULT_CONSTELLATIONS.find((c) => c.name.toLowerCase() === key);
  const id = preset?.id || uid("sys");
  data.constellations.push({
    id,
    name: trimmed,
    hue: preset?.hue ?? Math.floor(Math.random() * 360),
    orbit: 0.72 + Math.random() * 0.18,
    phase: Math.random() * Math.PI * 2,
  });
  return id;
}

export function updateWorld(id, patch) {
  const world = worldById(id);
  if (!world) return null;
  if (patch.constellationName) {
    patch.constellationId = ensureConstellation(patch.constellationName);
    delete patch.constellationName;
  }
  const leaving = "constellationId" in patch && !patch.constellationId && world.constellationId;
  Object.assign(world, patch);
  if (leaving) {
    world.constellationId = null;
    world.orbit = nextFreeOrbit();
  }
  emit();
  return world;
}

export function removeWorld(id) {
  data.worlds = data.worlds.filter((w) => w.id !== id);
  emit();
}

export function setOrbit(id, orbit) {
  const world = worldById(id);
  if (!world) return;
  world.orbit = snapOrbit(orbit);
  emit();
}

export function leaveConstellation(id, orbit) {
  const world = worldById(id);
  if (!world) return;
  world.constellationId = null;
  world.orbit = snapOrbit(orbit);
  emit();
}

export function joinWorlds(sourceId, targetId) {
  const a = worldById(sourceId);
  const b = worldById(targetId);
  if (!a || !b || a.id === b.id) return null;
  let cid = b.constellationId || a.constellationId;
  if (!cid) {
    cid = ensureConstellation(`${b.name} system`);
  }
  a.constellationId = cid;
  b.constellationId = cid;
  a.localPhase = 0;
  b.localPhase = Math.PI;
  emit();
  return constellationById(cid);
}

export function launchWorld(id) {
  const world = worldById(id);
  if (!world) return { world: null, evolved: null };
  const before = world.visits;
  world.visits += 1;
  world.lastVisit = Date.now();
  const evolved = EVOLUTION.find((step) => before < step.at && world.visits >= step.at) || null;
  emit();
  return { world, evolved };
}

export function matchCommand(query) {
  const q = query.replace(/^\//, "").trim().toLowerCase();
  if (!q) return [];
  return data.worlds
    .filter((w) => {
      const host = (() => {
        try {
          return new URL(w.url).hostname.replace(/^www\./, "");
        } catch {
          return "";
        }
      })();
      return (
        w.name.toLowerCase().startsWith(q) ||
        host.startsWith(q) ||
        w.name.toLowerCase().includes(q)
      );
    })
    .slice(0, 6);
}

export function setConstellationOrbit(id, orbit) {
  const c = constellationById(id);
  if (!c) return;
  c.orbit = snapOrbit(orbit);
  emit();
}

export function advancePhases(dt, reduced, hoverId = null) {
  if (reduced) return;
  for (const c of data.constellations) {
    const radius = 0.55 + c.orbit * 0.4;
    c.phase += dt * (0.045 / Math.pow(radius, 1.5));
  }
  for (const w of data.worlds) {
    const members = w.constellationId ? worldsIn(w.constellationId) : [];
    const slow = w.id === hoverId ? 0.12 : 1;
    if (w.constellationId && members.length >= 2) {
      w.localPhase += dt * 0.55 * slow;
    } else {
      const r = 0.22 + w.orbit * 0.78;
      w.phase += dt * (0.22 / Math.pow(r, 1.5)) * slow;
    }
  }
}
