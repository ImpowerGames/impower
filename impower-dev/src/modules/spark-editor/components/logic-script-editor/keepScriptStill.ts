export function keepScriptStill(column: HTMLElement): () => void {
  const header = column.querySelector(":scope > [data-script-header]");
  if (!header || typeof ResizeObserver === "undefined") {
    return () => {};
  }
  let height: number | null = null;
  let padded = 0;
  let paddedScroller: HTMLElement | null = null;
  let ownPadding = 0;
  let observedScroller: HTMLElement | null = null;
  let anchor: { scroller: HTMLElement; top: number } | null = null;
  const findScroller = () => column.querySelector<HTMLElement>(".cm-scroller");
  const textTop = (scroller: HTMLElement) =>
    (scroller.firstElementChild ?? scroller).getBoundingClientRect().top;
  const settle = () => {
    const scroller = findScroller();
    anchor = scroller ? { scroller, top: textTop(scroller) } : null;
  };
  const pad = (scroller: HTMLElement, amount: number) => {
    if (amount > 0 && padded === 0) {
      ownPadding = parseFloat(getComputedStyle(scroller).paddingTop) || 0;
    }
    padded = amount;
    paddedScroller = amount > 0 ? scroller : null;
    scroller.style.paddingTop = amount > 0 ? `${ownPadding + amount}px` : "";
  };
  const hold = (scroller: HTMLElement, moved: number) => {
    if (scroller !== paddedScroller) {
      padded = 0;
    }
    if (moved < 0) {
      const up = Math.min(-moved, scroller.scrollTop);
      pad(scroller, padded + (-moved - up));
      scroller.scrollTop -= up;
    } else if (moved > 0) {
      const unpadded = Math.min(moved, padded);
      pad(scroller, padded - unpadded);
      scroller.scrollTop += moved - unpadded;
    }
  };
  const observer = new ResizeObserver(() => {
    const next = header.getBoundingClientRect().height;
    const scroller = findScroller();
    if (scroller && height != null && next !== height) {
      hold(
        scroller,
        anchor?.scroller === scroller
          ? textTop(scroller) - anchor.top
          : next - height,
      );
    }
    height = next;
    if (scroller && scroller !== observedScroller) {
      if (observedScroller) {
        observer.unobserve(observedScroller);
      }
      observer.observe(scroller);
      observedScroller = scroller;
    }
    settle();
  });
  column.addEventListener("scroll", settle, true);
  observer.observe(header);
  return () => {
    observer.disconnect();
    column.removeEventListener("scroll", settle, true);
    if (paddedScroller) {
      pad(paddedScroller, 0);
    }
  };
}
