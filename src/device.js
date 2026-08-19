export function isMobileUi() {
  return window.matchMedia("(max-width: 720px), (pointer: coarse)").matches;
}

export function isKeyboardOpen() {
  const vv = window.visualViewport;
  if (!vv) return false;
  return innerHeight - vv.height - vv.offsetTop > 80;
}
