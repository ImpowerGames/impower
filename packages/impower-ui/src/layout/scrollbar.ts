export const SCROLLBAR_SIZE_VARIABLE = "--scrollbar-size";

export function measureScrollbarSize(): number {
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:absolute;top:0;left:-200px;width:100px;height:50px;visibility:hidden;overflow-y:scroll;scrollbar-width:thin;scrollbar-gutter:stable";
  document.body.appendChild(probe);
  const size = probe.offsetWidth - probe.clientWidth;
  probe.remove();
  return size;
}

let connected = false;

export function connectScrollbarSize(): void {
  if (connected || typeof window === "undefined" || !document.body) {
    return;
  }
  connected = true;
  const sync = () => {
    document.documentElement.style.setProperty(SCROLLBAR_SIZE_VARIABLE, `${measureScrollbarSize()}px`);
  };
  sync();
  window.addEventListener("resize", sync);
}
