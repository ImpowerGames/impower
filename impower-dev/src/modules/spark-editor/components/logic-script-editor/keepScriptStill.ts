export function keepScriptStill(column: HTMLElement): () => void {
  const header = column.querySelector(":scope > [data-script-header]");
  if (!header || typeof ResizeObserver === "undefined") {
    return () => {};
  }
  let height: number | null = null;
  const observer = new ResizeObserver(() => {
    const next = header.getBoundingClientRect().height;
    if (height != null && next !== height) {
      const scroller = column.querySelector<HTMLElement>(".cm-scroller");
      if (scroller) {
        scroller.scrollTop += next - height;
      }
    }
    height = next;
  });
  observer.observe(header);
  return () => observer.disconnect();
}
