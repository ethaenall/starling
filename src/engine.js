import { clamp, lerp, TAU, development } from "./math.js";
import { getState, advancePhases, grouped, worldsIn, constellationById } from "./universe.js";
import { drawPlanetBody } from "./planet-gen.js";
import { createStarfield, drawSky, drawSun, skyPalette, skyPeriod } from "./sky.js";

const TILT = 0.4;

export function createEngine(canvas, visuals, hooks) {
  const ctx = canvas.getContext("2d");
  const stars = createStarfield(480);
  const mouse = { x: innerWidth / 2, y: innerHeight / 2, down: false };
  const parallax = { x: 0, y: 0 };
  const particles = [];
  let hoverId = null;
  let drag = null;
  let last = performance.now();
  let shooting = null;
  let running = true;
  let searchPulse = 0;

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    canvas.style.width = `${innerWidth}px`;
    canvas.style.height = `${innerHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function layout() {
    const w = innerWidth;
    const h = innerHeight;
    const cx = w / 2;
    const cy = h / 2 + h * 0.015;
    const reach = Math.min(w * 0.42, h * 0.46);
    const inner = Math.max(248, Math.min(w, h) * 0.235);
    const outer = Math.max(inner + 90, reach);
    return { w, h, cx, cy, inner, outer };
  }

  function radiusOf(orbit, L) {
    return lerp(L.inner, L.outer, clamp(orbit, 0, 1));
  }

  function placeWorlds() {
    const L = layout();
    const { worlds } = getState();
    const placed = [];
    const systemCenters = new Map();

    for (const world of worlds) {
      const vis = visuals.get(world.id);
      if (!vis) continue;
      let x;
      let y;
      let depth;
      const members = world.constellationId ? worldsIn(world.constellationId) : [];
      const inSystem = world.constellationId && members.length >= 2;

      if (inSystem) {
        const c = constellationById(world.constellationId);
        if (!systemCenters.has(c.id)) {
          const R = radiusOf(c.orbit, L);
          systemCenters.set(c.id, {
            constellation: c,
            x: L.cx + Math.cos(c.phase) * R,
            y: L.cy + Math.sin(c.phase) * R * TILT,
            depth: Math.sin(c.phase),
            R,
          });
        }
        const sys = systemCenters.get(c.id);
        const idx = members.findIndex((m) => m.id === world.id);
        const localR = 28 + idx * 16;
        x = sys.x + Math.cos(world.localPhase) * localR;
        y = sys.y + Math.sin(world.localPhase) * localR * TILT;
        depth = sys.depth + Math.sin(world.localPhase) * 0.15;
      } else {
        const R = radiusOf(world.orbit, L);
        x = L.cx + Math.cos(world.phase) * R;
        y = L.cy + Math.sin(world.phase) * R * TILT;
        depth = Math.sin(world.phase);
      }

      const sizeMul = lerp(0.82, 1.18, 0.5 + depth * 0.5);
      const r =
        (16 + development(world.visits) * 18) *
        (world.scale || 1) *
        sizeMul *
        (0.85 + innerWidth / 2400);
      placed.push({ world, vis, x, y, r, depth, inSystem });
    }
    placed.sort((a, b) => a.depth - b.depth);
    return { L, placed, systemCenters };
  }

  function hitTest(px, py) {
    const { placed } = placeWorlds();
    for (let i = placed.length - 1; i >= 0; i--) {
      const p = placed[i];
      const dx = px - p.x;
      const dy = py - p.y;
      if (dx * dx + dy * dy <= (p.r + 10) * (p.r + 10)) return p;
    }
    return null;
  }

  function spawnBurst(x, y, color) {
    for (let i = 0; i < 28; i++) {
      const a = Math.random() * TAU;
      const s = 40 + Math.random() * 120;
      particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 1,
        color,
      });
    }
  }

  function drawOrbits(L, hoverWorld) {
    const { settings, worlds, constellations } = getState();
    if (!settings.showOrbits) return;
    ctx.save();
    for (const world of worlds) {
      const members = world.constellationId ? worldsIn(world.constellationId) : [];
      if (world.constellationId && members.length >= 2) continue;
      const R = radiusOf(world.orbit, L);
      ctx.beginPath();
      ctx.ellipse(L.cx, L.cy, R, R * TILT, 0, 0, TAU);
      ctx.strokeStyle =
        hoverWorld?.id === world.id ? "rgba(255,214,160,0.32)" : "rgba(255,255,255,0.06)";
      ctx.lineWidth = hoverWorld?.id === world.id ? 1.4 : 1;
      ctx.stroke();
    }
    for (const c of constellations) {
      if (!grouped(c.id)) continue;
      const R = radiusOf(c.orbit, L);
      ctx.beginPath();
      ctx.ellipse(L.cx, L.cy, R, R * TILT, 0, 0, TAU);
      ctx.setLineDash([4, 8]);
      ctx.strokeStyle = "rgba(180, 190, 255, 0.14)";
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  function drawSystemLinks(systemCenters, placed) {
    for (const sys of systemCenters.values()) {
      const members = placed.filter((p) => p.world.constellationId === sys.constellation.id);
      if (members.length < 2) continue;
      ctx.strokeStyle = "rgba(200, 210, 255, 0.16)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      members.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = "rgba(230, 226, 214, 0.55)";
      ctx.font = "500 11px Outfit, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(sys.constellation.name.toUpperCase(), sys.x, sys.y - 36);
    }
  }

  function drawWorld(p, L, dt, reduced) {
    const vis = p.vis;
    if (!reduced) vis.spin += vis.spinSpeed * dt;

    ctx.save();
    ctx.translate(p.x, p.y);
    const glow = ctx.createRadialGradient(0, 0, p.r * 0.2, 0, 0, p.r * 2.4);
    glow.addColorStop(0, vis.glowColor);
    glow.addColorStop(1, "transparent");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, p.r * 2.4, 0, TAU);
    ctx.fill();

    const lightAng = Math.atan2(L.cy - p.y, L.cx - p.x);
    drawPlanetBody(ctx, vis, p.r, vis.spin);
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, p.r, 0, TAU);
    ctx.clip();
    const gx = Math.cos(lightAng) * p.r;
    const gy = Math.sin(lightAng) * p.r;
    const lg = ctx.createLinearGradient(-gx, -gy, gx, gy);
    lg.addColorStop(0, "rgba(0,0,0,0.55)");
    lg.addColorStop(0.45, "rgba(0,0,0,0.05)");
    lg.addColorStop(1, "rgba(255,230,180,0.22)");
    ctx.fillStyle = lg;
    ctx.fillRect(-p.r, -p.r, p.r * 2, p.r * 2);
    ctx.restore();

    for (const moon of vis.moons) {
      if (!reduced) moon.phase += moon.speed * dt;
      const mx = Math.cos(moon.phase) * p.r * moon.dist;
      const my = Math.sin(moon.phase) * p.r * moon.dist * 0.45;
      ctx.fillStyle = moon.color;
      ctx.beginPath();
      ctx.arc(mx, my, Math.max(1.4, p.r * moon.radius), 0, TAU);
      ctx.fill();
    }

    if (getState().settings.showLabels || p.world.id === hoverId) {
      ctx.font = "500 12px Outfit, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = p.world.id === hoverId ? "rgba(244,241,234,0.95)" : "rgba(244,241,234,0.62)";
      ctx.fillText(`${p.world.icon}  ${p.world.name}`, 0, p.r + 18);
    }
    ctx.restore();
  }

  function drawDragGhost(L) {
    if (!drag) return;
    ctx.save();
    ctx.strokeStyle = "rgba(255,214,160,0.2)";
    for (let i = 0; i < 6; i++) {
      const R = radiusOf(i / 5, L);
      ctx.beginPath();
      ctx.ellipse(L.cx, L.cy, R, R * TILT, 0, 0, TAU);
      ctx.stroke();
    }
    const p = drag.placed;
    ctx.globalAlpha = 0.7;
    ctx.translate(mouse.x, mouse.y);
    drawPlanetBody(ctx, p.vis, p.r, p.vis.spin);
    ctx.restore();
  }

  function drawParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt * 1.6;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.2 * p.life, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const { settings } = getState();
    const reduced = settings.reducedMotion;
    const pal = skyPalette();
    document.body.dataset.sky = skyPeriod();

    if (!reduced) advancePhases(dt, false, hoverId);

    parallax.x = lerp(parallax.x, reduced ? 0 : (mouse.x / innerWidth - 0.5) * 2, 0.06);
    parallax.y = lerp(parallax.y, reduced ? 0 : (mouse.y / innerHeight - 0.5) * 2, 0.06);

    if (!reduced && Math.random() < dt * 0.08 && !shooting) {
      shooting = {
        x: Math.random() * innerWidth,
        y: Math.random() * innerHeight * 0.45,
        vx: 220 + Math.random() * 180,
        vy: 80 + Math.random() * 60,
        life: 1,
      };
    }
    if (shooting) {
      shooting.x += shooting.vx * dt;
      shooting.y += shooting.vy * dt;
      shooting.life -= dt * 1.4;
      if (shooting.life <= 0) shooting = null;
    }

    searchPulse = lerp(searchPulse, document.getElementById("search-input") === document.activeElement ? 1 : 0.35, dt * 4);

    const { L, placed, systemCenters } = placeWorlds();
    drawSky(ctx, L.w, L.h, pal, stars, now / 1000, parallax, shooting);
    drawSun(ctx, L.cx, L.cy, pal, searchPulse);
    drawOrbits(L, placed.find((p) => p.world.id === hoverId)?.world);
    drawSystemLinks(systemCenters, placed);

    if (drag) {
      for (const p of placed) {
        if (p.world.id === drag.id) continue;
        drawWorld(p, L, dt, reduced);
      }
      drawDragGhost(L);
    } else {
      for (const p of placed) drawWorld(p, L, dt, reduced);
    }
    drawParticles(dt);

    const hovered = hitTest(mouse.x, mouse.y);
    const nextId = drag ? drag.id : hovered?.world.id || null;
    if (nextId !== hoverId) {
      hoverId = nextId;
      canvas.classList.toggle("is-over-world", Boolean(hoverId) && !drag);
      hooks.onHover(hoverId, hovered || null);
    } else if (hovered) {
      hooks.onMoveCard?.(hovered);
    }

    requestAnimationFrame(frame);
  }

  function onMove(e) {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    hooks.onPointer?.(mouse.x, mouse.y);
    if (drag && !drag.moved) {
      const dx = mouse.x - drag.sx;
      const dy = mouse.y - drag.sy;
      if (dx * dx + dy * dy > 64) {
        drag.moved = true;
        canvas.classList.add("is-dragging");
        hooks.onHover(null, null);
      }
    }
  }

  function onDown(e) {
    if (e.target !== canvas || e.button !== 0) return;
    mouse.down = true;
    const hit = hitTest(e.clientX, e.clientY);
    if (hit) {
      drag = {
        id: hit.world.id,
        sx: e.clientX,
        sy: e.clientY,
        moved: false,
        placed: hit,
      };
    }
  }

  function onUp(e) {
    mouse.down = false;
    canvas.classList.remove("is-dragging");
    if (!drag) return;
    const current = drag;
    drag = null;
    if (e.button !== 0) return;
    if (!current.moved) {
      hooks.onActivate(current.id);
      return;
    }
    const L = layout();
    const dx = e.clientX - L.cx;
    const dy = (e.clientY - L.cy) / TILT;
    const dist = Math.hypot(dx, dy);
    const orbit = clamp((dist - L.inner) / (L.outer - L.inner), 0, 1);
    const other = hitTest(e.clientX, e.clientY);
    hooks.onDragEnd({
      id: current.id,
      orbit,
      groupWithId: other && other.world.id !== current.id ? other.world.id : null,
    });
  }

  function onMenu(e) {
    const hit = hitTest(e.clientX, e.clientY);
    if (!hit) return;
    e.preventDefault();
    hooks.onEdit?.(hit.world.id);
  }

  window.addEventListener("resize", resize);
  window.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerdown", onDown);
  window.addEventListener("pointerup", onUp);
  canvas.addEventListener("contextmenu", onMenu);
  resize();
  requestAnimationFrame(frame);

  return {
    burst(id, color = "rgba(255,220,160,1)") {
      const { placed } = placeWorlds();
      const p = placed.find((x) => x.world.id === id);
      if (p) spawnBurst(p.x, p.y, color);
    },
    screenOf(id) {
      const { placed } = placeWorlds();
      return placed.find((x) => x.world.id === id) || null;
    },
    layout,
    stop() {
      running = false;
    },
  };
}
