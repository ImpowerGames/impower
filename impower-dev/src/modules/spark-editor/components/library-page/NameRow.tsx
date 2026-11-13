import { ListRow, TextField } from "@impower/impower-ui/components";
import { fitToKeyboard, useCoarsePointer } from "@impower/impower-ui/layout";
import type { ComponentChildren } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";

export type NameRowProps = {
  icon: ComponentChildren;
  label: string;
  initial?: string;
  suffix?: string;
  wrapError?: boolean;
  returnFocus?: () => HTMLElement | null;
  onCommit: (name: string) => Promise<void>;
  onCancel: () => void;
};

const REVEAL_MARGIN = 8;

const scrolls = (element: Element) =>
  element.scrollHeight > element.clientHeight &&
  !["visible", "clip"].includes(getComputedStyle(element).overflowY);

function keepInView(first: Element, last: Element) {
  for (let scroller = first.parentElement; scroller; scroller = scroller.parentElement) {
    if (!scrolls(scroller)) {
      continue;
    }
    const top = first.getBoundingClientRect().top;
    const bottom = last.getBoundingClientRect().bottom;
    const start = scroller.getBoundingClientRect().top + scroller.clientTop;
    const end = start + scroller.clientHeight;
    const margin = Math.max(0, Math.min(REVEAL_MARGIN, (scroller.clientHeight - (bottom - top)) / 2));
    const below = Math.max(0, bottom + margin - end);
    const shift = top - margin - below < start ? top - margin - start : below;
    if (shift) {
      scroller.scrollTop += shift;
    }
  }
}

export default function NameRow({
  icon,
  label,
  initial = "",
  suffix,
  wrapError = false,
  returnFocus,
  onCommit,
  onCancel,
}: NameRowProps) {
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initial);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const cancelled = useRef(false);
  const box = useRef<HTMLSpanElement>(null);
  const message = useRef<HTMLSpanElement>(null);
  const coarse = useCoarsePointer();

  const reveal = () => {
    if (!box.current || input.current !== document.activeElement) {
      return;
    }
    keepInView(box.current, message.current ?? box.current);
  };

  useLayoutEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  useEffect(() => (coarse ? fitToKeyboard(reveal) : undefined), [coarse]);

  useLayoutEffect(reveal, [error]);

  const commit = async (submitted: boolean) => {
    if (busy.current || cancelled.current) {
      return;
    }
    const name = input.current?.value ?? value;
    const unchanged = initial ? name === initial : !submitted && !name.trim();
    if (unchanged) {
      onCancel();
      return;
    }
    busy.current = true;
    try {
      await onCommit(name);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      input.current?.focus();
    } finally {
      busy.current = false;
    }
  };

  return (
    <ListRow
      icon={icon}
      descriptionFit={wrapError ? "wrap" : undefined}
      overflow="self"
      label={
        <span
          ref={box}
          class="flex h-[26px] min-w-0 items-center rounded-control border border-edge bg-bg focus-within:border-accent"
        >
          <TextField
            ref={input}
            frame="inset"
            purpose="literal"
            aria-label={label}
            aria-invalid={error ? "true" : undefined}
            aria-describedby={error ? "scripts-name-error" : undefined}
            maxLength={200}
            value={value}
            class="px-2 text-[14px]"
            onValueChange={(next) => {
              setValue(next);
              setError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void commit(true);
              } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                cancelled.current = true;
                const back = returnFocus?.();
                onCancel();
                if (back?.isConnected) {
                  back.focus();
                }
              }
            }}
            onBlur={() => {
              if (cancelled.current) {
                return;
              }
              if (!error) {
                void commit(false);
              }
            }}
          />
          {suffix && <span class="pr-2 text-[14px] text-muted">{suffix}</span>}
        </span>
      }
      description={
        error ? (
          <span ref={message} id="scripts-name-error" role="alert" class="text-error">
            {error}
          </span>
        ) : undefined
      }
    />
  );
}
