export function isExtension() {
  try {
    return Boolean(globalThis.chrome?.runtime?.id);
  } catch {
    return false;
  }
}

export function go(url) {
  if (isExtension()) {
    window.location.assign(url);
    return;
  }
  window.open(url, "_blank", "noopener");
}
