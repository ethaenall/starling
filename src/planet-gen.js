import {
  cyrb128,
  mulberry32,
  fbm3,
  mixRgb,
  hueShift,
  development,
  clamp,
} from "./math.js";

const BIOMES = ["terra", "desert", "ice", "lava", "ocean", "gas", "toxic", "storm"];

function rgb(r, g, b) {
  return { r, g, b };
}

function put(data, x, y, w, c, a = 255) {
  const i = (y * w + x) * 4;
  data[i] = c.r;
  data[i + 1] = c.g;
  data[i + 2] = c.b;
  data[i + 3] = a;
}

function sampleBiome(kind, n, lat, band, rnd) {
  if (kind === "gas" || kind === "storm") {
    const dark = kind === "storm";
    const a = dark ? rgb(40, 28, 70) : rgb(210, 150, 70);
    const b = dark ? rgb(180, 90, 40) : rgb(230, 210, 170);
    const c = dark ? rgb(20, 16, 36) : rgb(120, 70, 40);
    const t = clamp(0.5 + band * 0.5 + (n - 0.5) * 0.35, 0, 1);
    return mixRgb(mixRgb(a, b, t), c, Math.abs(band) * 0.35);
  }
  if (kind === "lava") {
    const crust = rgb(28, 12, 8);
    const magma = rgb(255, 90, 20);
    const ember = rgb(255, 200, 80);
    if (n > 0.62) return mixRgb(magma, ember, (n - 0.62) / 0.38);
    return mixRgb(crust, magma, n * 0.4);
  }
  if (kind === "ice") {
    const sea = rgb(90, 140, 170);
    const ice = rgb(230, 240, 250);
    const rock = rgb(170, 190, 210);
    const cap = Math.abs(lat) > 0.55 + n * 0.1;
    if (cap) return ice;
    return n > 0.5 ? mixRgb(rock, ice, n) : mixRgb(sea, ice, n * 0.6);
  }
  if (kind === "desert") {
    const dune = rgb(210, 150, 70);
    const rust = rgb(170, 80, 40);
    const stone = rgb(90, 70, 55);
    return mixRgb(mixRgb(dune, rust, n), stone, Math.abs(lat) * 0.3);
  }
  if (kind === "toxic") {
    const goo = rgb(40, 90, 30);
    const glow = rgb(160, 230, 40);
    const haze = rgb(20, 40, 30);
    return mixRgb(mixRgb(haze, goo, n), glow, Math.max(0, n - 0.55) * 2);
  }
  if (kind === "ocean") {
    const deep = rgb(8, 30, 70);
    const reef = rgb(20, 120, 110);
    const land = rgb(40, 110, 70);
    if (n > 0.72) return land;
    return mixRgb(deep, reef, n);
  }
  const ocean = rgb(16, 60, 110);
  const land = rgb(46, 110, 62);
  const peak = rgb(210, 210, 200);
  const ice = rgb(236, 244, 250);
  const cap = Math.abs(lat) > 0.72 - n * 0.08;
  if (cap) return ice;
  if (n < 0.48) return mixRgb(ocean, rgb(30, 90, 130), n);
  if (n > 0.78) return mixRgb(land, peak, (n - 0.78) / 0.22);
  return land;
}

function makeTexture(width, height, paint) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(width, height);
  paint(img.data, width, height);
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export function generateVisual(world) {
  const host = (() => {
    try {
      return new URL(world.url).hostname;
    } catch {
      return world.name;
    }
  })();
  const seedStr = `${host}|${world.name}`;
  const seeds = cyrb128(seedStr);
  const rnd = mulberry32(seeds[0]);
  const seed = seeds[1];
  const kind = BIOMES[seeds[2] % BIOMES.length];
  const hueOff = world.hue ?? 0;
  const dev = development(world.visits);
  const cloudyBiome = kind === "terra" || kind === "ocean" || kind === "ice" || kind === "toxic";
  const hasClouds = dev > 0.18 && (cloudyBiome || rnd() > 0.5);
  const hasRings = dev > 0.72;
  const moons = Math.min(3, Math.floor(dev * 3.2));

  const w = 256;
  const h = 128;
  const barren = rgb(62, 58, 64);
  const surface = makeTexture(w, h, (data) => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = x / w;
        const v = y / h;
        const lon = u * Math.PI * 2;
        const lat = v * 2 - 1;
        const px = Math.cos(lon) * Math.cos(lat * 0.5 * Math.PI);
        const py = Math.sin(lat * 0.5 * Math.PI);
        const pz = Math.sin(lon) * Math.cos(lat * 0.5 * Math.PI);
        const n = fbm3(px * 2.4, py * 2.4, pz * 2.4, seed, 4);
        const band = Math.sin(lat * (6 + rnd() * 5) + n * 3);
        let c = sampleBiome(kind, n, lat, band, rnd);
        if (hueOff) c = hueShift(c, hueOff);
        c = mixRgb(barren, c, 0.28 + dev * 0.72);
        if (dev > 0.42 && Math.abs(lat) < 0.62) {
          const city = fbm3(px * 16, py * 16, pz * 16, seed + 9, 2);
          if (city > 0.66 - dev * 0.1) {
            const light = kind === "lava" ? rgb(255, 160, 70) : rgb(255, 220, 140);
            c = mixRgb(c, light, (dev - 0.42) * city * 0.95);
          }
        }
        const polar = Math.pow(Math.abs(lat), 3) * (0.18 - dev * 0.08);
        c = mixRgb(c, rgb(20, 20, 28), polar);
        put(data, x, y, w, c);
      }
    }
  });

  const clouds = hasClouds
    ? makeTexture(w, h, (data) => {
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const u = x / w;
            const v = y / h;
            const lon = u * Math.PI * 2;
            const lat = v * 2 - 1;
            const px = Math.cos(lon);
            const py = lat;
            const pz = Math.sin(lon);
            const n = fbm3(px * 3.2, py * 3.6, pz * 3.2, seed + 77, 3);
            const a = n > 0.55 ? Math.floor((n - 0.55) * 2.2 * 200 * (0.2 + dev)) : 0;
            put(data, x, y, w, rgb(245, 248, 255), clamp(a, 0, 220));
          }
        }
      })
    : null;

  const base = sampleBiome(kind, 0.55, 0, 0.2, rnd);
  const tint = hueOff ? hueShift(base, hueOff) : base;
  const moonList = [];
  for (let i = 0; i < moons; i++) {
    moonList.push({
      dist: 1.55 + i * 0.38 + rnd() * 0.1,
      radius: 0.12 + rnd() * 0.08,
      phase: rnd() * Math.PI * 2,
      speed: 0.6 + rnd() * 0.8,
      color: `rgba(${180 + rnd() * 50}, ${180 + rnd() * 40}, ${190 + rnd() * 40}, 0.95)`,
    });
  }

  return {
    surface,
    clouds,
    kind,
    hasRings,
    ringInner: 1.35,
    ringOuter: 1.9 + rnd() * 0.25,
    ringTilt: 0.28 + rnd() * 0.16,
    ringRot: (rnd() - 0.5) * 0.6,
    ringColor: `rgba(${tint.r}, ${tint.g}, ${tint.b}, ${0.28 + dev * 0.4})`,
    moons: moonList,
    glowColor: `rgba(${tint.r}, ${Math.min(255, tint.g + 20)}, ${tint.b}, ${0.08 + dev * 0.42})`,
    atmColor: `rgba(${tint.r}, ${tint.g}, ${Math.min(255, tint.b + 40)}, ${0.05 + dev * 0.4})`,
    atmRadius: 1.06 + dev * 0.28,
    glowRadius: 1.7 + dev * 1.5,
    spin: rnd(),
    spinSpeed: 0.015 + rnd() * 0.03,
    baseRadius: 16 + development(world.visits) * 18,
    seed: seedStr,
    dev,
  };
}

export function drawMiniPlanet(ctx, visual, size = 72) {
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.translate(size / 2, size / 2);
  drawPlanetBody(ctx, visual, size * 0.36, 0);
  ctx.restore();
}

export function drawPlanetBody(ctx, visual, r, spin) {
  if (visual.hasRings) drawRing(ctx, visual, r, "back");

  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.clip();
  const tw = visual.surface.width;
  const th = visual.surface.height;
  const dw = (tw / th) * r * 2;
  const ox = -((spin % 1) * dw);
  ctx.drawImage(visual.surface, ox - r, -r, dw, r * 2);
  ctx.drawImage(visual.surface, ox - r + dw, -r, dw, r * 2);
  if (visual.clouds) {
    const cox = -(((spin * 1.35) % 1) * dw);
    ctx.globalAlpha = 0.85;
    ctx.drawImage(visual.clouds, cox - r, -r, dw, r * 2);
    ctx.drawImage(visual.clouds, cox - r + dw, -r, dw, r * 2);
    ctx.globalAlpha = 1;
  }
  const shade = ctx.createRadialGradient(-r * 0.32, -r * 0.34, r * 0.08, 0, 0, r);
  shade.addColorStop(0, "rgba(255,255,255,0.28)");
  shade.addColorStop(0.42, "rgba(0,0,0,0)");
  shade.addColorStop(1, "rgba(0,0,0,0.62)");
  ctx.fillStyle = shade;
  ctx.fillRect(-r, -r, r * 2, r * 2);
  ctx.restore();

  const atm = ctx.createRadialGradient(0, 0, r * 0.82, 0, 0, r * (visual.atmRadius || 1.22));
  atm.addColorStop(0, "transparent");
  atm.addColorStop(0.55, visual.atmColor);
  atm.addColorStop(1, "transparent");
  ctx.fillStyle = atm;
  ctx.beginPath();
  ctx.arc(0, 0, r * (visual.atmRadius || 1.22), 0, Math.PI * 2);
  ctx.fill();

  if (visual.hasRings) drawRing(ctx, visual, r, "front");
}

function drawRing(ctx, visual, r, pass) {
  ctx.save();
  ctx.rotate(visual.ringRot);
  ctx.scale(1, visual.ringTilt);
  ctx.strokeStyle = visual.ringColor;
  ctx.lineWidth = (visual.ringOuter - visual.ringInner) * r;
  ctx.beginPath();
  const rad = ((visual.ringInner + visual.ringOuter) / 2) * r;
  if (pass === "back") ctx.arc(0, 0, rad, Math.PI, Math.PI * 2);
  else ctx.arc(0, 0, rad, 0, Math.PI);
  ctx.stroke();
  ctx.restore();
}
