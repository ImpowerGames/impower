import { signal } from "@preact/signals";

const READING_BAND = "0px 0px -66% 0px";
const SCROLL_MARGIN = 16;
const JUMP_HOLD_MS = 400;
const TRAVEL_HOLD_MS = 160;

export const currentSection = signal<string | undefined>(undefined);

let scroller: HTMLElement | undefined;
let holding = false;
let settle: ReturnType<typeof setTimeout> | undefined;

const hold = (ms: number) => {
  holding = true;
  clearTimeout(settle);
  settle = setTimeout(() => {
    holding = false;
  }, ms);
};

const prefersReducedMotion = () =>
  typeof matchMedia !== "function" || matchMedia("(prefers-reduced-motion: reduce)").matches;

export function jumpToSection(id: string, { smooth = true }: { smooth?: boolean } = {}): boolean {
  const section = scroller?.ownerDocument.getElementById(id);
  if (!scroller || !section || !scroller.contains(section)) {
    return false;
  }
  hold(JUMP_HOLD_MS);
  scroller.scrollTo({
    top:
      scroller.scrollTop +
      section.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top -
      SCROLL_MARGIN,
    behavior: smooth && !prefersReducedMotion() ? "smooth" : "auto",
  });
  (section.querySelector<HTMLElement>("h2, h3") ?? section).focus({ preventScroll: true });
  currentSection.value = id;
  return true;
}

export function watchSections(element: HTMLElement, ids: readonly string[]): () => void {
  scroller = element;
  const reading = new Set<string>();
  const atEnd = () => element.scrollTop + element.clientHeight >= element.scrollHeight - 4;
  const pick = () => {
    if (holding) {
      return;
    }
    if (atEnd() && element.scrollTop > 0) {
      currentSection.value = ids.at(-1);
      return;
    }
    const last = ids.findLast((id) => reading.has(id));
    if (last) {
      currentSection.value = last;
    }
  };
  const observer =
    typeof IntersectionObserver === "function"
      ? new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (entry.isIntersecting) {
                reading.add(entry.target.id);
              } else {
                reading.delete(entry.target.id);
              }
            }
            pick();
          },
          { root: element, rootMargin: READING_BAND },
        )
      : undefined;
  for (const id of ids) {
    const section = element.ownerDocument.getElementById(id);
    if (section) {
      observer?.observe(section);
    }
  }
  const onScroll = () => {
    if (holding) {
      hold(TRAVEL_HOLD_MS);
      return;
    }
    if (atEnd()) {
      pick();
    }
  };
  element.addEventListener("scroll", onScroll, { passive: true });
  currentSection.value = ids[0];
  return () => {
    observer?.disconnect();
    element.removeEventListener("scroll", onScroll);
    clearTimeout(settle);
    holding = false;
    if (scroller === element) {
      scroller = undefined;
    }
  };
}
