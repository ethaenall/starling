import { clamp, lerp, lerpAngle, TAU, development } from "./math.js";
import {
  getState,
  advancePhases,
  grouped,
  worldsIn,
  constellationById,
  snapOrbit,
  ORBIT_LANES,
} from "./universe.js";
import { drawPlanetBody } from "./planet-gen.js";
import { createStarfield, drawSky, drawSun, skyPalette, skyPeriod } from "./sky.js";

const TILT = 0.4;
const MERGE_PAD = 36;

export function createEngine(canvas, visuals, hooks) {
  const ctx = canvas.getContext("2d");
  const stars = createStarfield(480);
  const mouse = { x: innerWidth / 2, y: innerHeight / 2, down: false };
  const parallax = { x: 0, y: 0 };
  const particles = [];
  const shownSys = new Map();
  let hoverId = null;
  let drag = null;
  let last = performance.now();
  let shooting = null;
  let running = true;
  let searchPulse = 0;
  let frameDt = 0.016;
  let placeCache = null;
  let intro = 0;

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

  function computePlacement(dt) {
    const L = layout();
    const { worlds, settings } = getState();
    const placed = [];
    const systemCenters = new Map();
    const reduced = settings.reducedMotion;
    const live = dt > 0 && !reduced;
    const lerpK = live ? 1 - Math.exp(-dt * 7) : 1;
    const angK = live ? 1 - Math.exp(-dt * 8) : 1;
    const enter = 1 - Math.pow(1 - intro, 3);

    for (const world of worlds) {
      const vis = visuals.get(world.id);
      if (!vis) continue;
      if (live) {
        vis.shownOrbit = lerp(vis.shownOrbit ?? world.orbit, world.orbit, lerpK);
        vis.shownPhase = lerpAngle(vis.shownPhase ?? world.phase, world.phase, angK);
        vis.shownLocal = lerpAngle(vis.shownLocal ?? world.localPhase, world.localPhase, angK);
      } else {
        vis.shownOrbit = world.orbit;
        vis.shownPhase = world.phase;
        vis.shownLocal = world.localPhase;
      }

      let x;
      let y;
      let depth;
      const members = world.constellationId ? worldsIn(world.constellationId) : [];
      const c = world.constellationId ? constellationById(world.constellationId) : null;
      const inSystem = Boolean(c && members.length >= 2);

      if (inSystem) {
        if (!systemCenters.has(c.id)) {
          let shown = shownSys.get(c.id);
          if (!shown) {
            shown = { orbit: c.orbit, phase: c.phase };
            shownSys.set(c.id, shown);
          }
          if (live) {
            shown.orbit = lerp(shown.orbit, c.orbit, lerpK);
            shown.phase = lerpAngle(shown.phase, c.phase, angK);
          } else {
            shown.orbit = c.orbit;
            shown.phase = c.phase;
          }
          const R = radiusOf(shown.orbit, L) * (1.22 - 0.22 * enter);
          systemCenters.set(c.id, {
            constellation: c,
            x: L.cx + Math.cos(shown.phase) * R,
            y: L.cy + Math.sin(shown.phase) * R * TILT,
            depth: Math.sin(shown.phase),
            R,
          });
        }
        const sys = systemCenters.get(c.id);
        const idx = members.findIndex((m) => m.id === world.id);
        let localR = 52 + idx * 28;
        const arriving = world.arriving ?? 0;
        if (arriving > 0) localR = lerp(92, localR, 1 - arriving * arriving);
        x = sys.x + Math.cos(vis.shownLocal) * localR;
        y = sys.y + Math.sin(vis.shownLocal) * localR * TILT;
        depth = sys.depth + Math.sin(vis.shownLocal) * 0.15;
      } else {
        let R = radiusOf(vis.shownOrbit, L) * (1.22 - 0.22 * enter);
        let phase = vis.shownPhase;
        const arriving = world.arriving ?? 0;
        if (arriving > 0) {
          const ease = 1 - arriving * arriving;
          R = lerp(L.outer * 1.42, R, ease);
          phase += arriving * 1.85;
        }
        x = L.cx + Math.cos(phase) * R;
        y = L.cy + Math.sin(phase) * R * TILT;
        depth = Math.sin(phase);
      }

      const sizeMul = lerp(0.82, 1.18, 0.5 + depth * 0.5);
      const r =
        (16 + development(world.visits) * 18) *
        (world.scale || 1) *
        sizeMul *
        (0.85 + innerWidth / 2400);
      placed.push({ world, vis, x, y, r, depth, inSystem, alpha: clamp((intro - 0.08) / 0.55, 0, 1) });
    }
    placed.sort((a, b) => a.depth - b.depth);
    return { L, placed, systemCenters };
  }

  function placeWorlds() {
    if (placeCache) return placeCache;
    return computePlacement(0);
  }

  function hitTest(px, py, excludeId = null) {
    const { placed } = placeWorlds();
    for (let i = placed.length - 1; i >= 0; i--) {
      const p = placed[i];
      if (p.world.id === excludeId) continue;
      const dx = px - p.x;
      const dy = py - p.y;
      if (dx * dx + dy * dy <= (p.r + 10) * (p.r + 10)) return p;
    }
    return null;
  }

  function nearestMerge(px, py, excludeId) {
    const { placed } = placeWorlds();
    let best = null;
    let bestD = Infinity;
    for (const p of placed) {
      if (p.world.id === excludeId) continue;
      const d = Math.hypot(px - p.x, py - p.y);
      if (d < p.r + MERGE_PAD && d < bestD) {
        best = p;
        bestD = d;
      }
    }
    return best;
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

  function tickArrivals(placed, dt, reduced) {
    for (const p of placed) {
      const w = p.world;
      if (w.arriving == null) continue;
      if (w.arriving > 0) {
        w.arriving = reduced ? 0 : Math.max(0, w.arriving - dt * 0.85);
      }
      if (w.arriving === 0 && w.arrivedBurst === false) {
        w.arrivedBurst = true;
        spawnBurst(p.x, p.y, "rgba(255,220,160,1)");
      }
    }
  }

  function drawOrbits(L, hoverWorld, dragGhost) {
    const { settings, worlds, constellations } = getState();
    if (!settings.showOrbits && !drag) return;
    ctx.save();
    if (drag) {
      const snapLane = dragGhost?.lane;
      for (let i = 0; i < ORBIT_LANES; i++) {
        const orbit = i / (ORBIT_LANES - 1);
        const R = radiusOf(orbit, L);
        ctx.beginPath();
        ctx.ellipse(L.cx, L.cy, R, R * TILT, 0, 0, TAU);
        const active = snapLane != null && Math.abs(snapLane - orbit) < 0.001;
        ctx.strokeStyle = active ? "rgba(255,214,160,0.55)" : "rgba(255,214,160,0.16)";
        ctx.lineWidth = active ? 2 : 1;
        ctx.stroke();
      }
    } else if (settings.showOrbits) {
      for (const world of worlds) {
        const members = world.constellationId ? worldsIn(world.constellationId) : [];
        if (world.constellationId && members.length >= 2) continue;
        const vis = visuals.get(world.id);
        const R = radiusOf(vis?.shownOrbit ?? world.orbit, L);
        ctx.beginPath();
        ctx.ellipse(L.cx, L.cy, R, R * TILT, 0, 0, TAU);
        ctx.strokeStyle =
          hoverWorld?.id === world.id ? "rgba(255,214,160,0.32)" : "rgba(255,255,255,0.06)";
        ctx.lineWidth = hoverWorld?.id === world.id ? 1.4 : 1;
        ctx.stroke();
      }
      for (const c of constellations) {
        if (!grouped(c.id)) continue;
        const shown = shownSys.get(c.id);
        const R = radiusOf(shown?.orbit ?? c.orbit, L);
        ctx.beginPath();
        ctx.ellipse(L.cx, L.cy, R, R * TILT, 0, 0, TAU);
        ctx.setLineDash([4, 8]);
        ctx.strokeStyle = "rgba(180, 190, 255, 0.14)";
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    ctx.restore();
  }

  function drawSystemLinks(systemCenters, placed) {
    ctx.save();
    ctx.globalAlpha = intro;
    for (const sys of systemCenters.values()) {
      const members = placed.filter((p) => p.world.constellationId === sys.constellation.id);
      if (members.length < 2) continue;
      ctx.strokeStyle = "rgba(200, 210, 255, 0.22)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      members.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = "rgba(230, 226, 214, 0.7)";
      ctx.font = "500 11px \"Avenir Next\", \"Segoe UI\", sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(sys.constellation.name.toUpperCase(), sys.x, sys.y - 36);
    }
    ctx.restore();
  }

  function drawWorld(p, L, dt, reduced, { hovered = false, mergeTarget = false } = {}) {
    const vis = p.vis;
    if (!reduced) vis.spin += vis.spinSpeed * dt;

    ctx.save();
    ctx.globalAlpha = p.alpha ?? 1;
    ctx.translate(p.x, p.y);
    const glowR = p.r * (vis.glowRadius || 2.4) * (hovered ? 1.32 : 1);
    const glow = ctx.createRadialGradient(0, 0, p.r * 0.2, 0, 0, glowR);
    glow.addColorStop(0, vis.glowColor);
    glow.addColorStop(1, "transparent");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, glowR, 0, TAU);
    ctx.fill();

    if (mergeTarget) {
      ctx.strokeStyle = "rgba(255,214,160,0.85)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, p.r + 10, 0, TAU);
      ctx.stroke();
    }

    const lightAng = Math.atan2(L.cy - p.y, L.cx - p.x);
    drawPlanetBody(ctx, vis, p.r, vis.spin);
    if (hovered) {
      const halo = ctx.createRadialGradient(0, 0, p.r * 0.9, 0, 0, p.r * 1.45);
      halo.addColorStop(0, "transparent");
      halo.addColorStop(0.55, vis.atmColor);
      halo.addColorStop(1, "transparent");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(0, 0, p.r * 1.45, 0, TAU);
      ctx.fill();
    }
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

    if (getState().settings.showLabels || p.world.id === hoverId || mergeTarget) {
      ctx.font = "500 12px \"Avenir Next\", \"Segoe UI\", sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = p.world.id === hoverId || mergeTarget ? "rgba(244,241,234,0.95)" : "rgba(244,241,234,0.62)";
      ctx.fillText(`${p.world.icon}  ${p.world.name}`, 0, p.r + 18);
    }
    ctx.restore();
  }

  function dragGhost(L, placed) {
    if (!drag?.moved) return null;
    const merge = nearestMerge(mouse.x, mouse.y, drag.id);
    if (merge) {
      return { x: merge.x, y: merge.y, merge, lane: null };
    }
    const dx = mouse.x - L.cx;
    const dy = (mouse.y - L.cy) / TILT;
    const dist = Math.hypot(dx, dy);
    const lane = snapOrbit(clamp((dist - L.inner) / Math.max(1, L.outer - L.inner), 0, 1));
    const R = radiusOf(lane, L);
    const ang = Math.atan2((mouse.y - L.cy) / TILT, mouse.x - L.cx);
    return {
      x: L.cx + Math.cos(ang) * R,
      y: L.cy + Math.sin(ang) * R * TILT,
      merge: null,
      lane,
    };
  }

  function drawDragGhost(ghost, L) {
    if (!ghost || !drag) return;
    const p = drag.placed;
    if (ghost.merge) {
      ctx.save();
      ctx.font = "500 12px \"Avenir Next\", \"Segoe UI\", sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255,214,160,0.9)";
      ctx.fillText("Join system", ghost.x, ghost.y - p.r - 18);
      ctx.restore();
    }
    ctx.save();
    ctx.globalAlpha = 0.78;
    ctx.translate(ghost.x, ghost.y);
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
    frameDt = dt;
    const { settings } = getState();
    const reduced = settings.reducedMotion;
    document.body.classList.toggle("is-reduced", reduced);
    if (reduced) intro = 1;
    else intro = Math.min(1, intro + dt / 1.55);
    const skyOverride = new URLSearchParams(location.search).get("sky");
    const pal = skyPalette(new Date(), skyOverride);
    document.body.dataset.sky = skyOverride || skyPeriod();

    if (!reduced) advancePhases(dt, false, hoverId);
    else if (shooting) shooting = null;

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

    searchPulse = lerp(
      searchPulse,
      document.getElementById("search-input") === document.activeElement ? 1 : 0.35,
      dt * 4
    );

    placeCache = computePlacement(dt);
    const { L, placed, systemCenters } = placeCache;
    tickArrivals(placed, dt, reduced);
    const ghost = dragGhost(L, placed);
    drawSky(ctx, L.w, L.h, pal, stars, now / 1000, parallax, shooting);
    drawSun(ctx, L.cx, L.cy, pal, searchPulse * intro);
    drawOrbits(L, placed.find((p) => p.world.id === hoverId)?.world, ghost);
    drawSystemLinks(systemCenters, placed);

    const mergeId = ghost?.merge?.world.id;
    if (drag?.moved) {
      for (const p of placed) {
        if (p.world.id === drag.id) continue;
        drawWorld(p, L, dt, reduced, {
          hovered: p.world.id === hoverId,
          mergeTarget: p.world.id === mergeId,
        });
      }
      drawDragGhost(ghost, L);
    } else {
      for (const p of placed) {
        drawWorld(p, L, dt, reduced, { hovered: p.world.id === hoverId });
      }
    }
    drawParticles(dt);

    const hovered = drag?.moved || intro < 0.7 ? null : hitTest(mouse.x, mouse.y);
    const nextId = drag?.moved ? drag.id : hovered?.world.id || null;
    if (nextId !== hoverId) {
      hoverId = nextId;
      canvas.classList.toggle("is-over-world", Boolean(hovered) && !drag?.moved);
      hooks.onHover(drag?.moved ? null : hoverId, hovered || null);
    } else if (hovered && !drag?.moved) {
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
    const merge = nearestMerge(e.clientX, e.clientY, current.id);
    const dx = e.clientX - L.cx;
    const dy = (e.clientY - L.cy) / TILT;
    const dist = Math.hypot(dx, dy);
    const orbit = snapOrbit(clamp((dist - L.inner) / Math.max(1, L.outer - L.inner), 0, 1));
    hooks.onDragEnd({
      id: current.id,
      orbit,
      groupWithId: merge?.world.id || null,
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
