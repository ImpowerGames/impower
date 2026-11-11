import { cva, type VariantProps } from "class-variance-authority";
import { toChildArray, type ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { cn } from "../../utils/cn";
import Button from "../button/Button";
import { ArrowIcon, BackIcon } from "../icon/icons.generated";

export const carouselVariants = cva("flex min-h-0 min-w-0 flex-col", {
  variants: {
    size: {
      fill: "h-full",
      auto: "",
    },
  },
  defaultVariants: { size: "fill" },
});

export const carouselTrackVariants = cva([
  "flex min-h-0 min-w-0 flex-1 gap-3 overflow-x-auto overflow-y-hidden px-3 pt-1 pb-2",
  "snap-x snap-proximity scroll-px-3 touch-pan-x [contain:inline-size] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
]);

export const carouselItemVariants = cva([
  "flex min-w-44 max-w-61 flex-[0_0_58%] snap-start overflow-hidden rounded-control border border-solid border-edge bg-paper",
  "*:min-w-0 *:flex-1",
  "aria-[current=true]:outline-2 aria-[current=true]:-outline-offset-2 aria-[current=true]:outline-accent",
]);

export type CarouselSize = NonNullable<VariantProps<typeof carouselVariants>["size"]>;

export type CarouselProps = VariantProps<typeof carouselVariants> & {
  label: string;
  previousLabel: string;
  nextLabel: string;
  index?: number;
  onIndexChange?: (index: number) => void;
  trailing?: ComponentChildren;
  children?: ComponentChildren;
  class?: string;
};

const SETTLE_MS = 100;
const PROGRAMMATIC_MS = 500;
const TRACK_INSET = 12;

const reducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

const clamp = (index: number, count: number) => Math.max(0, Math.min(count - 1, index));

const focusable = (item: Element | undefined) =>
  item?.matches("button, a, [tabindex]")
    ? (item as HTMLElement)
    : item?.querySelector<HTMLElement>("button, a, [tabindex]");

export default function Carousel({
  label,
  previousLabel,
  nextLabel,
  index,
  onIndexChange,
  trailing,
  size,
  children,
  class: className,
}: CarouselProps) {
  const items = toChildArray(children);
  const count = items.length;
  const [own, setOwn] = useState(index ?? 0);
  const at = clamp(index ?? own, count);
  const track = useRef<HTMLDivElement>(null);
  const programmatic = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timer.current), []);

  const choose = (next: number) => {
    const chosen = clamp(next, count);
    setOwn(chosen);
    if (chosen !== at) onIndexChange?.(chosen);
    return chosen;
  };

  const itemAt = (position: number) =>
    track.current?.querySelectorAll<HTMLElement>("[data-carousel-item]")[position];

  const reveal = (next: number, focus = false) => {
    const chosen = choose(next);
    const item = itemAt(chosen);
    const scroller = track.current;
    if (!item || !scroller) return;
    const delta = item.getBoundingClientRect().left - scroller.getBoundingClientRect().left - TRACK_INSET;
    programmatic.current = true;
    clearTimeout(timer.current);
    if (delta) scroller.scrollBy?.({ left: delta, behavior: reducedMotion() ? "auto" : "smooth" });
    timer.current = setTimeout(() => {
      programmatic.current = false;
    }, PROGRAMMATIC_MS);
    if (focus) focusable(item)?.focus({ preventScroll: true });
  };

  const settle = () => {
    const scroller = track.current;
    if (!scroller || programmatic.current) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const bounds = scroller.getBoundingClientRect();
      const middle = bounds.left + bounds.width / 2;
      const distance = (item: HTMLElement) => {
        const box = item.getBoundingClientRect();
        return Math.abs(box.left + box.width / 2 - middle);
      };
      const all = Array.from(scroller.querySelectorAll<HTMLElement>("[data-carousel-item]"));
      const nearest = all.reduce((best, item, position) => (distance(item) < distance(all[best]!) ? position : best), 0);
      choose(nearest);
    }, SETTLE_MS);
  };

  const release = () => {
    programmatic.current = false;
    clearTimeout(timer.current);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
    const item = (event.target as Element | null)?.closest("[data-carousel-item]");
    if (!keys.includes(event.key) || !item) return;
    const position = Array.from(track.current?.querySelectorAll("[data-carousel-item]") ?? []).indexOf(item);
    event.preventDefault();
    reveal(
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? count - 1
          : position + (event.key === "ArrowRight" ? 1 : -1),
      true,
    );
  };

  return (
    <div class={cn(carouselVariants({ size }), className)} data-carousel>
      <div
        ref={track}
        class={carouselTrackVariants()}
        data-carousel-track
        onScroll={settle}
        onPointerDown={release}
        onWheel={release}
        onKeyDown={onKeyDown}
      >
        {items.map((item, position) => (
          <div
            key={position}
            class={carouselItemVariants()}
            data-carousel-item
            aria-current={position === at ? "true" : undefined}
          >
            {item}
          </div>
        ))}
      </div>
      <footer class="grid min-h-11 flex-none grid-cols-[44px_1fr_44px] items-center gap-2 px-2.5 pb-0.5">
        <div role="group" aria-label={label} class="col-start-2 flex items-center gap-0.5 justify-self-center">
          <Button
            variant="quiet"
            size="icon"
            class="text-muted"
            aria-label={previousLabel}
            disabled={at <= 0}
            onClick={() => reveal(at - 1)}
          >
            <BackIcon />
          </Button>
          <span aria-live="polite" class="min-w-12 text-center text-[12px]/[1.4] text-muted tabular-nums">
            <span aria-hidden="true">{count ? `${at + 1} / ${count}` : "0 / 0"}</span>
            <span class="sr-only">{count ? `Item ${at + 1} of ${count}` : "No items"}</span>
          </span>
          <Button
            variant="quiet"
            size="icon"
            class="text-muted"
            aria-label={nextLabel}
            disabled={at >= count - 1}
            onClick={() => reveal(at + 1)}
          >
            <ArrowIcon />
          </Button>
        </div>
        {trailing && <div class="col-start-3 flex justify-center">{trailing}</div>}
      </footer>
    </div>
  );
}
