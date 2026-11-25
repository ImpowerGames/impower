export function keepScriptStill(column: HTMLElement): () => void {
  const header = column.querySelector(":scope > [data-script-header]");
  if (!header || typeof ResizeObserver === "undefined") {
    return () => {};
  }
  let height: number | null = null;
  let padded = 0;
  let paddedScroller: HTMLElement | null = null;
  let ownPadding = 0;
  let scrolled: { scroller: Element; top: number } | null = null;
  const record = (scroller: Element) => {
    scrolled = { scroller, top: scroller.scrollTop };
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
  const clampedBy = (scroller: HTMLElement, shift: number) => {
    if (shift >= 0 || scrolled?.scroller !== scroller) {
      return 0;
    }
    const top = scroller.scrollTop;
    const max = scroller.scrollHeight - scroller.clientHeight;
    return top < scrolled.top && top >= max - 1
      ? Math.max(shift, top - scrolled.top)
      : 0;
  };
  const onScroll = (event: Event) => {
    if (event.target instanceof Element && event.target.matches(".cm-scroller")) {
      record(event.target);
    }
  };
  const observer = new ResizeObserver(() => {
    const next = header.getBoundingClientRect().height;
    const scroller = column.querySelector<HTMLElement>(".cm-scroller");
    if (scroller && height != null && next !== height) {
      const shift = next - height;
      hold(scroller, shift - clampedBy(scroller, shift));
    }
    height = next;
    if (scroller) {
      record(scroller);
    }
  });
  column.addEventListener("scroll", onScroll, true);
  observer.observe(header);
  return () => {
    observer.disconnect();
    column.removeEventListener("scroll", onScroll, true);
    if (paddedScroller) {
      pad(paddedScroller, 0);
    }
  };
}
