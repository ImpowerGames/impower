import { useLayoutEffect, useRef, useState, type MutableRef } from "preact/hooks";

const boxesOf = (element: Element): DOMRect[] =>
  [...element.children].flatMap((child) =>
    getComputedStyle(child).display === "contents"
      ? boxesOf(child)
      : [child.getBoundingClientRect()].filter((box) => box.width > 0),
  );

const rowOf = (group: Element) => {
  const boxes = boxesOf(group);
  const gap = parseFloat(getComputedStyle(group).columnGap) || 0;
  return {
    width:
      boxes.reduce((sum, box) => sum + box.width, 0) +
      gap * Math.max(0, boxes.length - 1),
    gap,
    slot: Math.max(0, ...boxes.map((box) => box.width)),
  };
};

export const STEP_SLOTS = 2;

export function stepSlotsFit(bar: HTMLElement, stepSlotsShown: boolean) {
  const [start, centre, end] = [...bar.children].map(rowOf);
  if (!start || !centre || !end) {
    return true;
  }
  const style = getComputedStyle(bar);
  const padding =
    (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
  const gap = parseFloat(style.columnGap) || 0;
  const missing = stepSlotsShown ? 0 : STEP_SLOTS * (centre.slot + centre.gap);
  const needed =
    padding + 2 * gap + 2 * Math.max(start.width, end.width) + centre.width + missing;
  return bar.clientWidth + 0.5 >= needed;
}

export function useStepSlotsFit(
  bar: MutableRef<HTMLElement | null>,
  running: boolean,
) {
  const [fits, setFits] = useState(true);
  const measure = useRef(() => {});
  measure.current = () => {
    if (bar.current) {
      setFits(stepSlotsFit(bar.current, running && fits));
    }
  };
  useLayoutEffect(() => measure.current());
  useLayoutEffect(() => {
    const element = bar.current;
    if (!element) {
      return;
    }
    const remeasure = () => measure.current();
    const resizes =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(remeasure);
    const contents = new MutationObserver(() => {
      resizes?.disconnect();
      watch();
      remeasure();
    });
    const watch = () => {
      resizes?.observe(element);
      for (const group of element.children) {
        resizes?.observe(group);
      }
    };
    watch();
    contents.observe(element, { childList: true, subtree: true });
    document.fonts?.addEventListener("loadingdone", remeasure);
    return () => {
      resizes?.disconnect();
      contents.disconnect();
      document.fonts?.removeEventListener("loadingdone", remeasure);
    };
  }, [bar]);
  return fits;
}
