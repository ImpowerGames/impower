export function keepScriptStill(column: HTMLElement): () => void {
  const header = column.querySelector(":scope > [data-script-header]");
  if (!header || typeof ResizeObserver === "undefined") {
    return () => {};
  }
  let height: number | null = null;
  let padded = 0;
  let paddedScroller: HTMLElement | null = null;
  let ownPadding = 0;
  const pad = (scroller: HTMLElement, amount: number) => {
    if (amount > 0 && padded === 0) {
      ownPadding = parseFloat(getComputedStyle(scroller).paddingTop) || 0;
    }
    padded = amount;
    paddedScroller = amount > 0 ? scroller : null;
    scroller.style.paddingTop = amount > 0 ? `${ownPadding + amount}px` : "";
  };
  const hold = (scroller: HTMLElement, shift: number) => {
    if (scroller !== paddedScroller) {
      padded = 0;
    }
    if (shift < 0) {
      const scrolled = Math.min(-shift, scroller.scrollTop);
      scroller.scrollTop -= scrolled;
      pad(scroller, padded + (-shift - scrolled));
    } else {
      const unpadded = Math.min(shift, padded);
      pad(scroller, padded - unpadded);
      scroller.scrollTop += shift - unpadded;
    }
  };
  const observer = new ResizeObserver(() => {
    const next = header.getBoundingClientRect().height;
    if (height != null && next !== height) {
      const scroller = column.querySelector<HTMLElement>(".cm-scroller");
      if (scroller) {
        hold(scroller, next - height);
      }
    }
    height = next;
  });
  observer.observe(header);
  return () => {
    observer.disconnect();
    if (paddedScroller) {
      pad(paddedScroller, 0);
    }
  };
}
