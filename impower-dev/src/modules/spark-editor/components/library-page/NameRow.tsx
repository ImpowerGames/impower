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
    if (!input.current || input.current !== document.activeElement) {
      return;
    }
    box.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
    message.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
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
          class="flex h-[26px] min-w-0 scroll-my-2 items-center rounded-control border border-edge bg-bg focus-within:border-accent"
        >
          <TextField
            ref={input}
            frame="inset"
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
          <span ref={message} id="scripts-name-error" role="alert" class="scroll-my-2 text-error">
            {error}
          </span>
        ) : undefined
      }
    />
  );
}
