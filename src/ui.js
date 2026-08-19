import {
  getState,
  addWorld,
  updateWorld,
  removeWorld,
  updateSettings,
  resetUniverse,
  replaceUniverse,
  matchCommand,
  launchWorld,
  ensureConstellation,
} from "./universe.js";
import { ENGINES, stageOf } from "./defaults.js";
import { prettyHost, nameFromUrl } from "./math.js";
import { downloadJson } from "./storage.js";
import { go, isExtension } from "./platform.js";
import { loadApod, renderApod } from "./apod.js";
import { drawMiniPlanet } from "./planet-gen.js";
import { isMobileUi } from "./device.js";

export function bindUI(app) {
  const { visuals, rebuild } = app;
  const engine = () => app.engine;
  const $ = (id) => document.getElementById(id);
  const search = $("search-input");
  const suggest = $("search-suggest");
  const card = $("world-card");
  const hint = $("hint");
  let hoverId = null;
  let pinnedId = null;
  let suggestIndex = 0;
  let suggestItems = [];
  let editingId = null;

  function toast(msg) {
    const el = document.createElement("div");
    el.className = "toast glass";
    el.textContent = msg;
    $("toasts").appendChild(el);
    setTimeout(() => el.remove(), 3400);
  }

  function openModal(id) {
    card.hidden = true;
    $(id).hidden = false;
    const focusable = $(id).querySelector("input, select, button");
    if (!isMobileUi()) focusable?.focus();
  }

  function closeModal(id) {
    if (id) $(id).hidden = true;
    else {
      for (const modal of document.querySelectorAll(".modal")) modal.hidden = true;
    }
  }

  function anyModal() {
    return [...document.querySelectorAll(".modal")].some((m) => !m.hidden);
  }

  function renderChips(el, selected) {
    const { constellations } = getState();
    el.innerHTML = "";
    const none = document.createElement("button");
    none.type = "button";
    none.className = `chip ${selected ? "" : "is-on"}`;
    none.textContent = "Lone orbit";
    none.onclick = () => {
      el.dataset.value = "";
      renderChips(el, "");
    };
    el.appendChild(none);
    for (const c of constellations) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `chip ${selected === c.id || selected === c.name ? "is-on" : ""}`;
      btn.textContent = c.name;
      btn.onclick = () => {
        el.dataset.value = c.id;
        renderChips(el, c.id);
      };
      el.appendChild(btn);
    }
  }

  function fillEngines() {
    const sel = $("set-engine");
    sel.innerHTML = Object.entries(ENGINES)
      .map(([id, e]) => `<option value="${id}">${e.name}</option>`)
      .join("");
    sel.value = getState().settings.engine;
  }

  function syncSettings() {
    const s = getState().settings;
    $("set-engine").value = s.engine;
    $("set-orbits").checked = s.showOrbits;
    $("set-labels").checked = s.showLabels;
    $("set-motion").checked = s.reducedMotion;
  }

  function syncEmpty() {
    $("empty").hidden = getState().worlds.length > 0;
  }

  function hideHint() {
    hint.classList.add("is-gone");
  }

  function positionCard(placed) {
    if (!placed) {
      card.hidden = true;
      return;
    }
    card.hidden = false;
    if (isMobileUi()) {
      card.classList.add("is-sheet");
      card.style.left = "";
      card.style.top = "";
      return;
    }
    card.classList.remove("is-sheet");
    const pad = 18;
    let left = placed.x + placed.r + 20;
    let top = placed.y - 70;
    if (left + 270 > innerWidth) left = placed.x - placed.r - 280;
    if (top < 16) top = 16;
    if (top + 200 > innerHeight) top = innerHeight - 210;
    card.style.left = `${Math.max(pad, left)}px`;
    card.style.top = `${top}px`;
  }

  function showCard(placed) {
    hoverId = placed?.world.id || null;
    if (!placed || anyModal()) {
      if (!pinnedId) card.hidden = true;
      return;
    }
    const w = placed.world;
    $("card-name").textContent = `${w.icon} ${w.name}`;
    $("card-meta").textContent = `Visited ${w.visits} time${w.visits === 1 ? "" : "s"}`;
    $("card-stage").textContent = stageOf(w.visits).label;
    $("card-url").textContent = prettyHost(w.url);
    const vis = visuals.get(w.id);
    if (vis) drawMiniPlanet($("card-preview").getContext("2d"), vis, 72);
    positionCard(placed);
  }

  function launch(id) {
    const { world, evolved } = launchWorld(id);
    if (!world) return;
    pinnedId = null;
    card.hidden = true;
    if (evolved) {
      rebuild(world);
      engine()?.burst(world.id);
      toast(`${world.name} is evolving — ${evolved.label}`);
    }
    go(world.url);
  }

  function selectWorld(id) {
    if (pinnedId === id) {
      launch(id);
      return;
    }
    pinnedId = id;
    const placed = engine()?.screenOf(id);
    if (placed) showCard(placed);
  }

  function clearSelection() {
    pinnedId = null;
    hoverId = null;
    card.hidden = true;
    card.classList.remove("is-sheet");
  }

  function bindViewport() {
    const vv = window.visualViewport;
    const sync = () => {
      const occluded = vv ? innerHeight - vv.height - vv.offsetTop : 0;
      document.body.classList.toggle("is-keyboard", occluded > 80);
      document.documentElement.style.setProperty("--vv-bottom", `${Math.max(0, occluded)}px`);
    };
    vv?.addEventListener("resize", sync);
    vv?.addEventListener("scroll", sync);
    window.addEventListener("resize", sync);
    sync();
  }

  function renderSuggest(items) {
    suggestItems = items;
    suggestIndex = 0;
    if (!items.length) {
      suggest.hidden = true;
      suggest.innerHTML = "";
      return;
    }
    suggest.hidden = false;
    suggest.innerHTML = items
      .map(
        (w, i) =>
          `<li data-id="${w.id}" class="${i === 0 ? "is-active" : ""}">${w.icon} ${w.name}<span>${prettyHost(w.url)}</span></li>`
      )
      .join("");
  }

  search.addEventListener("input", () => {
    const q = search.value.trim();
    if (q.startsWith("/")) renderSuggest(matchCommand(q));
    else renderSuggest([]);
  });

  suggest.addEventListener("mousedown", (e) => {
    const li = e.target.closest("li");
    if (!li) return;
    e.preventDefault();
    launch(li.dataset.id);
    search.value = "";
    renderSuggest([]);
  });

  $("search").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = search.value.trim();
    if (!q) return;
    if (q.startsWith("/")) {
      const hits = matchCommand(q);
      const pick = hits[suggestIndex] || hits[0];
      if (pick) launch(pick.id);
      search.value = "";
      renderSuggest([]);
      return;
    }
    if (/^[^\s]+\.[^\s]+$/.test(q) || /^https?:\/\//i.test(q)) {
      const href = /^https?:\/\//i.test(q) ? q : `https://${q}`;
      go(href);
      search.value = "";
      return;
    }
    const engine = ENGINES[getState().settings.engine] || ENGINES.google;
    go(engine.href(q));
    search.value = "";
  });

  search.addEventListener("keydown", (e) => {
    if (suggest.hidden || !suggestItems.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      suggestIndex = (suggestIndex + 1) % suggestItems.length;
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      suggestIndex = (suggestIndex - 1 + suggestItems.length) % suggestItems.length;
    } else return;
    for (const [i, li] of [...suggest.children].entries()) {
      li.classList.toggle("is-active", i === suggestIndex);
    }
  });

  $("card-open").addEventListener("click", () => {
    if (hoverId) launch(hoverId);
  });

  $("card-edit").addEventListener("click", () => {
    if (hoverId) openEditor(hoverId);
  });

  function openAdd() {
    $("add-url").value = "";
    $("add-name").value = "";
    $("add-icon").value = "✦";
    $("add-constellation").value = "";
    renderChips($("add-chips"), "");
    $("add-chips").dataset.value = "";
    openModal("modal-add");
  }

  $("add-url").addEventListener("input", () => {
    if ($("add-name").dataset.touched) return;
    try {
      const fake = $("add-url").value.includes("://")
        ? $("add-url").value
        : `https://${$("add-url").value}`;
      $("add-name").value = nameFromUrl(fake);
    } catch {
      /* incomplete url */
    }
  });
  $("add-name").addEventListener("input", () => {
    $("add-name").dataset.touched = "1";
  });

  $("add-confirm").addEventListener("click", () => {
    try {
      const world = addWorld({
        url: $("add-url").value,
        name: $("add-name").value,
        icon: $("add-icon").value,
        constellationId: $("add-chips").dataset.value || null,
        constellationName: $("add-constellation").value,
      });
      rebuild(world);
      closeModal("modal-add");
      requestAnimationFrame(() => engine()?.burst(world.id));
      toast(`${world.name} has entered orbit`);
      syncEmpty();
    } catch {
      toast("That address couldn’t be read.");
    }
  });
  $("modal-add").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      $("add-confirm").click();
    }
  });

  function openEditor(id) {
    const w = getState().worlds.find((x) => x.id === id);
    if (!w) return;
    editingId = id;
    closeModal();
    $("edit-name").value = w.name;
    $("edit-url").value = w.url;
    $("edit-icon").value = w.icon;
    $("edit-hue").value = w.hue ?? 0;
    $("edit-scale").value = Math.round((w.scale || 1) * 100);
    $("edit-constellation").value = "";
    renderChips($("edit-chips"), w.constellationId || "");
    $("edit-chips").dataset.value = w.constellationId || "";
    openModal("modal-edit");
  }

  $("edit-save").addEventListener("click", () => {
    if (!editingId) return;
    const world = updateWorld(editingId, {
      name: $("edit-name").value,
      url: $("edit-url").value,
      icon: $("edit-icon").value,
      hue: Number($("edit-hue").value) || 0,
      scale: Number($("edit-scale").value) / 100,
      constellationId: $("edit-chips").dataset.value || null,
      constellationName: $("edit-constellation").value,
    });
    if (world) rebuild(world);
    closeModal("modal-edit");
    toast("World updated");
  });

  $("edit-delete").addEventListener("click", () => {
    if (!editingId) return;
    removeWorld(editingId);
    closeModal("modal-edit");
    card.hidden = true;
    syncEmpty();
    toast("The world left your sky");
  });

  let hueTimer = 0;
  $("edit-hue").addEventListener("input", () => {
    if (!editingId) return;
    clearTimeout(hueTimer);
    hueTimer = setTimeout(() => {
      const world = updateWorld(editingId, { hue: Number($("edit-hue").value) });
      if (world) rebuild(world);
    }, 40);
  });
  $("edit-scale").addEventListener("input", () => {
    if (!editingId) return;
    updateWorld(editingId, { scale: Number($("edit-scale").value) / 100 });
  });

  $("btn-add").addEventListener("click", openAdd);
  $("empty-add").addEventListener("click", openAdd);
  $("btn-settings").addEventListener("click", () => {
    fillEngines();
    syncSettings();
    openModal("modal-settings");
  });
  $("btn-keys").addEventListener("click", () => openModal("modal-keys"));
  $("btn-apod").addEventListener("click", async () => {
    openModal("modal-apod");
    $("apod-body").textContent = "Looking through the telescope…";
    try {
      const data = await loadApod();
      renderApod($("apod-body"), data);
    } catch (err) {
      $("apod-body").innerHTML = `<p>${err.message || "The telescope couldn’t find a signal."}</p>`;
    }
  });

  $("set-engine").addEventListener("change", () => updateSettings({ engine: $("set-engine").value }));
  $("set-orbits").addEventListener("change", () => updateSettings({ showOrbits: $("set-orbits").checked }));
  $("set-labels").addEventListener("change", () => updateSettings({ showLabels: $("set-labels").checked }));
  $("set-motion").addEventListener("change", () => updateSettings({ reducedMotion: $("set-motion").checked }));

  $("btn-export").addEventListener("click", () => {
    downloadJson("starling-universe.json", getState());
    toast("Universe exported");
  });
  $("btn-import").addEventListener("click", () => $("import-file").click());
  $("import-file").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const next = JSON.parse(await file.text());
      await replaceUniverse(next);
      rebuild();
      syncEmpty();
      toast("Universe restored");
      closeModal("modal-settings");
    } catch (err) {
      toast(err.message || "Could not restore that file.");
    }
  });
  $("btn-reset").addEventListener("click", () => {
    resetUniverse();
    rebuild();
    syncEmpty();
    toast("Starter sky restored");
  });

  document.addEventListener("click", (e) => {
    const close = e.target.closest("[data-close]");
    if (close) closeModal(close.getAttribute("data-close"));
    if (e.target.classList.contains("modal")) closeModal(e.target.id);
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeModal();
      card.hidden = true;
      search.blur();
      return;
    }
    const typing =
      document.activeElement &&
      (document.activeElement.tagName === "INPUT" ||
        document.activeElement.tagName === "SELECT" ||
        document.activeElement.tagName === "TEXTAREA");
    if (typing) return;
    if (anyModal()) return;
    if (e.key === "/" || e.key.toLowerCase() === "s") {
      e.preventDefault();
      search.focus();
      if (e.key === "/") search.value = "/";
    } else if (e.key === "+" || e.key.toLowerCase() === "a") {
      e.preventDefault();
      openAdd();
    } else if (e.key === "?") {
      e.preventDefault();
      openModal("modal-keys");
    }
  });

  window.addEventListener("pointerdown", hideHint, { once: true });
  window.addEventListener("keydown", hideHint, { once: true });
  setTimeout(hideHint, 8000);

  fillEngines();
  syncEmpty();
  bindViewport();
  if (isExtension()) {
    const note = $("ext-lede");
    if (note) note.hidden = false;
    document.body.dataset.ext = "1";
  }

  return {
    toast,
    showCard,
    hideCard(force = false) {
      if (pinnedId && !force) return;
      card.hidden = true;
      hoverId = null;
    },
    selectWorld,
    clearSelection,
    launch,
    openEditor,
    ensureConstellation,
  };
}
