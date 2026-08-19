import { mulberry32, mixRgb } from "./math.js";

const PALETTES = {
  dawn: {
    bg: { r: 28, g: 8, b: 22 },
    nebulaA: { r: 140, g: 40, b: 90 },
    nebulaB: { r: 220, g: 110, b: 55 },
    sun: { r: 255, g: 176, b: 120 },
    name: "dawn",
  },
  day: {
    bg: { r: 10, g: 18, b: 38 },
    nebulaA: { r: 40, g: 80, b: 150 },
    nebulaB: { r: 30, g: 50, b: 90 },
    sun: { r: 255, g: 232, b: 196 },
    name: "day",
  },
  dusk: {
    bg: { r: 32, g: 6, b: 14 },
    nebulaA: { r: 170, g: 35, b: 70 },
    nebulaB: { r: 255, g: 110, b: 40 },
    sun: { r: 255, g: 140, b: 85 },
    name: "dusk",
  },
  night: {
    bg: { r: 2, g: 3, b: 12 },
    nebulaA: { r: 28, g: 42, b: 120 },
    nebulaB: { r: 72, g: 18, b: 100 },
    sun: { r: 255, g: 214, b: 160 },
    name: "night",
  },
};

export function skyPeriod(date = new Date()) {
  const h = date.getHours() + date.getMinutes() / 60;
  if (h >= 5 && h < 7.5) return "dawn";
  if (h >= 7.5 && h < 17) return "day";
  if (h >= 17 && h < 20.5) return "dusk";
  return "night";
}

function blendPalettes(a, b, t) {
  return {
    bg: mixRgb(a.bg, b.bg, t),
    nebulaA: mixRgb(a.nebulaA, b.nebulaB, t),
    nebulaB: mixRgb(a.nebulaB, b.nebulaA, t),
    sun: mixRgb(a.sun, b.sun, t),
    name: t < 0.5 ? a.name : b.name,
  };
}

export function skyPalette(date = new Date(), name = null) {
  if (name && PALETTES[name]) return PALETTES[name];
  const h = date.getHours() + date.getMinutes() / 60;
  if (h >= 5 && h < 7.5) return blendPalettes(PALETTES.night, PALETTES.dawn, (h - 5) / 2.5);
  if (h >= 7.5 && h < 9) return blendPalettes(PALETTES.dawn, PALETTES.day, (h - 7.5) / 1.5);
  if (h >= 9 && h < 16.5) return PALETTES.day;
  if (h >= 16.5 && h < 18) return blendPalettes(PALETTES.day, PALETTES.dusk, (h - 16.5) / 1.5);
  if (h >= 18 && h < 20.5) return blendPalettes(PALETTES.dusk, PALETTES.night, (h - 18) / 2.5);
  return PALETTES.night;
}

export function cssRgb(c, a = 1) {
  return `rgba(${c.r | 0}, ${c.g | 0}, ${c.b | 0}, ${a})`;
}

export function createStarfield(count = 420) {
  const rnd = mulberry32(0x5a71e);
  const stars = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      x: rnd(),
      y: rnd(),
      z: rnd(),
      s: 0.4 + rnd() * 1.6,
      tw: rnd() * Math.PI * 2,
      tws: 0.4 + rnd() * 1.4,
    });
  }
  return stars;
}

export function drawSky(ctx, w, h, palette, stars, t, parallax, shooting) {
  ctx.fillStyle = cssRgb(palette.bg);
  ctx.fillRect(0, 0, w, h);

  const nx = parallax.x * 40;
  const ny = parallax.y * 28;

  const g1 = ctx.createRadialGradient(
    w * 0.22 + nx * 0.4,
    h * 0.28 + ny * 0.4,
    0,
    w * 0.22,
    h * 0.28,
    Math.max(w, h) * 0.55
  );
  g1.addColorStop(0, cssRgb(palette.nebulaA, 0.55));
  g1.addColorStop(1, "transparent");
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, w, h);

  const g2 = ctx.createRadialGradient(
    w * 0.78 + nx * 0.25,
    h * 0.7 + ny * 0.25,
    0,
    w * 0.78,
    h * 0.7,
    Math.max(w, h) * 0.5
  );
  g2.addColorStop(0, cssRgb(palette.nebulaB, 0.48));
  g2.addColorStop(1, "transparent");
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, w, h);

  const g3 = ctx.createRadialGradient(
    w * 0.5 + nx * 0.15,
    h * 0.12 + ny * 0.2,
    0,
    w * 0.5,
    h * 0.08,
    Math.max(w, h) * 0.42
  );
  g3.addColorStop(0, cssRgb(palette.nebulaA, 0.22));
  g3.addColorStop(1, "transparent");
  ctx.fillStyle = g3;
  ctx.fillRect(0, 0, w, h);

  for (const star of stars) {
    const depth = 0.35 + star.z * 0.65;
    const x = star.x * w + parallax.x * 28 * depth;
    const y = star.y * h + parallax.y * 20 * depth;
    const twinkle = 0.45 + 0.55 * Math.abs(Math.sin(t * star.tws + star.tw));
    ctx.fillStyle = `rgba(240, 236, 230, ${0.18 + twinkle * 0.55 * depth})`;
    ctx.fillRect(x, y, star.s * depth, star.s * depth);
  }

  if (shooting) {
    ctx.strokeStyle = `rgba(255,255,255,${shooting.life})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(shooting.x, shooting.y);
    ctx.lineTo(shooting.x - shooting.vx * 12, shooting.y - shooting.vy * 12);
    ctx.stroke();
  }
}

export function drawSun(ctx, cx, cy, palette, pulse) {
  const r = 90 + pulse * 10;
  const glow = ctx.createRadialGradient(cx, cy, 8, cx, cy, r * 4.2);
  glow.addColorStop(0, cssRgb(palette.sun, 0.34 + pulse * 0.14));
  glow.addColorStop(0.18, cssRgb(palette.sun, 0.16));
  glow.addColorStop(0.45, cssRgb(palette.sun, 0.05));
  glow.addColorStop(1, "transparent");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 4.2, 0, Math.PI * 2);
  ctx.fill();
}
