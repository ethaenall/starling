import "./styles.css";
import {
  bootUniverse,
  getState,
  setOrbit,
  joinWorlds,
  leaveConstellation,
  persistNow,
  worldById,
  grouped,
} from "./universe.js";
import { generateVisual } from "./planet-gen.js";
import { createEngine } from "./engine.js";
import { bindUI } from "./ui.js";
import { isMobileUi } from "./device.js";

const visuals = new Map();

function rebuild(world) {
  if (world) {
    visuals.set(world.id, generateVisual(world));
    return;
  }
  visuals.clear();
  for (const w of getState().worlds) {
    visuals.set(w.id, generateVisual(w));
  }
}

async function boot() {
  await bootUniverse();
  rebuild();

  const canvas = document.getElementById("sky");
  const app = { visuals, rebuild, engine: null };
  const ui = bindUI(app);

  app.engine = createEngine(canvas, visuals, {
    onHover(id, placed) {
      if (isMobileUi()) {
        if (id) ui.showCard(placed);
        return;
      }
      if (!id) ui.hideCard();
      else ui.showCard(placed);
    },
    onMoveCard(placed) {
      ui.showCard(placed);
    },
    onActivate(id) {
      if (isMobileUi()) ui.selectWorld(id);
      else ui.launch(id);
    },
    onBackground() {
      ui.clearSelection();
    },
    onEdit(id) {
      ui.openEditor(id);
    },
    onDragEnd({ id, orbit, groupWithId }) {
      if (groupWithId) {
        const sys = joinWorlds(id, groupWithId);
        const a = worldById(id);
        const b = worldById(groupWithId);
        if (sys && a && b) ui.toast(`${a.name} joined ${sys.name} with ${b.name}`);
      } else {
        const w = worldById(id);
        if (w?.constellationId && grouped(w.constellationId)) {
          leaveConstellation(id, orbit);
        } else {
          setOrbit(id, orbit);
        }
      }
    },
  });

  window.addEventListener("pagehide", () => persistNow());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") persistNow();
  });
}

boot();
