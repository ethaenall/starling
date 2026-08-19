export const ENGINES = {
  google: {
    name: "Google",
    href: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
  },
  ddg: {
    name: "DuckDuckGo",
    href: (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}`,
  },
  brave: {
    name: "Brave",
    href: (q) => `https://search.brave.com/search?q=${encodeURIComponent(q)}`,
  },
  bing: {
    name: "Bing",
    href: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}`,
  },
  ecosia: {
    name: "Ecosia",
    href: (q) => `https://www.ecosia.org/search?q=${encodeURIComponent(q)}`,
  },
};

export const DEFAULT_CONSTELLATIONS = [
  { id: "coding", name: "Coding", hue: 210 },
  { id: "school", name: "School", hue: 160 },
  { id: "entertainment", name: "Entertainment", hue: 20 },
];

export const STARTER_WORLDS = [
  {
    id: "seed:github",
    name: "GitHub",
    url: "https://github.com",
    icon: "🌎",
    visits: 14,
    orbit: 0.58,
    phase: 0.35,
    hue: null,
    scale: 1,
    constellationId: "coding",
    localPhase: 0.2,
    seeded: true,
  },
  {
    id: "seed:youtube",
    name: "YouTube",
    url: "https://youtube.com",
    icon: "🪐",
    visits: 23,
    orbit: 0.78,
    phase: 2.15,
    hue: null,
    scale: 1,
    constellationId: "entertainment",
    localPhase: 0,
    seeded: true,
  },
  {
    id: "seed:wikipedia",
    name: "Wikipedia",
    url: "https://wikipedia.org",
    icon: "🌑",
    visits: 8,
    orbit: 0.92,
    phase: 4.1,
    hue: null,
    scale: 1,
    constellationId: "school",
    localPhase: 0,
    seeded: true,
  },
  {
    id: "seed:hackclub",
    name: "Hack Club",
    url: "https://hackclub.com",
    icon: "☄️",
    visits: 11,
    orbit: 0.58,
    phase: 0.35,
    hue: null,
    scale: 1,
    constellationId: "coding",
    localPhase: 2.2,
    seeded: true,
  },
  {
    id: "seed:chatgpt",
    name: "ChatGPT",
    url: "https://chatgpt.com",
    icon: "🔵",
    visits: 19,
    orbit: 0.58,
    phase: 0.35,
    hue: null,
    scale: 1,
    constellationId: "coding",
    localPhase: 4.3,
    seeded: true,
  },
];

export const EVOLUTION = [
  { at: 5, label: "Atmosphere forming" },
  { at: 15, label: "Surface growing more complex" },
  { at: 40, label: "A ring system is emerging" },
];

export function stageOf(visits) {
  let stage = { at: 0, label: "A quiet world" };
  for (const step of EVOLUTION) {
    if (visits >= step.at) stage = step;
  }
  return stage;
}

export function starterConstellations() {
  return DEFAULT_CONSTELLATIONS.map((c) => ({
    ...c,
    orbit: c.id === "coding" ? 0.58 : c.id === "entertainment" ? 0.82 : 0.94,
    phase: c.id === "coding" ? 0.85 : c.id === "school" ? 4.1 : 2.15,
  }));
}

export function starterUniverse() {
  return {
    version: 2,
    settings: {
      engine: "google",
      showOrbits: true,
      showLabels: true,
      reducedMotion: false,
    },
    constellations: starterConstellations(),
    worlds: STARTER_WORLDS.map((w) => ({
      ...w,
      createdAt: Date.now(),
      lastVisit: null,
    })),
  };
}
