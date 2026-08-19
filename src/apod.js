const KEY = "starling.apod.";

export async function loadApod() {
  const day = new Date().toISOString().slice(0, 10);
  const cacheKey = KEY + day;
  const cached = sessionStorage.getItem(cacheKey);
  if (cached) return JSON.parse(cached);

  const res = await fetch(`https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY`);
  if (!res.ok) throw new Error("The telescope couldn't find a signal.");
  const data = await res.json();
  sessionStorage.setItem(cacheKey, JSON.stringify(data));
  return data;
}

export function renderApod(container, data) {
  if (!data) {
    container.innerHTML = `<p>The telescope couldn't find a signal. Try again in a little while.</p>`;
    return;
  }
  const media =
    data.media_type === "image"
      ? `<img src="${data.url}" alt="${escapeHtml(data.title)}" />`
      : data.thumbnail_url
        ? `<img src="${data.thumbnail_url}" alt="${escapeHtml(data.title)}" />`
        : `<p>Today's APOD is a video. Open it on NASA's site.</p>`;
  const credit = data.copyright ? `Credit: ${escapeHtml(data.copyright)}` : "NASA / APOD";
  container.innerHTML = `
    ${media}
    <h3>${escapeHtml(data.title)}</h3>
    <p>${escapeHtml((data.explanation || "").slice(0, 280))}${(data.explanation || "").length > 280 ? "…" : ""}</p>
    <p>${credit} · ${escapeHtml(data.date || "")}</p>
  `;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
