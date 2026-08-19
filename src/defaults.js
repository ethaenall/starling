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
    orbit: 0.18,
    phase: 0.35,
    hue: null,
    scale: 1,
    constellationId: null,
    seeded: true,
  },
  {
    id: "seed:youtube",
    name: "YouTube",
    url: "https://youtube.com",
    icon: "🪐",
    visits: 23,
    orbit: 0.42,
    phase: 1.85,
    hue: null,
    scale: 1,
    constellationId: null,
    seeded: true,
  },
  {
    id: "seed:wikipedia",
    name: "Wikipedia",
    url: "https://wikipedia.org",
    icon: "🌑",
    visits: 8,
    orbit: 0.7,
    phase: 3.3,
    hue: null,
    scale: 1,
    constellationId: null,
    seeded: true,
  },
  {
    id: "seed:hackclub",
    name: "Hack Club",
    url: "https://hackclub.com",
    icon: "☄️",
    visits: 11,
    orbit: 0.3,
    phase: 4.55,
    hue: null,
    scale: 1,
    constellationId: null,
    seeded: true,
  },
  {
    id: "seed:chatgpt",
    name: "ChatGPT",
    url: "https://chatgpt.com",
    icon: "🔵",
    visits: 19,
    orbit: 0.58,
    phase: 5.55,
    hue: null,
    scale: 1,
    constellationId: null,
    seeded: true,
  },
];

export const EVOLUTION = [
  { at: 5, label: "atmosphere forming" },
  { at: 15, label: "surface growing more complex" },
  { at: 40, label: "a ring system is emerging" },
];

export function starterUniverse() {
  return {
    version: 1,
    settings: {
      engine: "google",
      showOrbits: true,
      showLabels: true,
      reducedMotion: false,
    },
    constellations: DEFAULT_CONSTELLATIONS.map((c) => ({
      ...c,
      orbit: 0.78,
      phase: c.id === "coding" ? 0.4 : c.id === "school" ? 2.4 : 4.5,
    })),
    worlds: STARTER_WORLDS.map((w) => ({
      ...w,
      createdAt: Date.now(),
      lastVisit: null,
      localPhase: Math.random() * Math.PI * 2,
    })),
  };
}
