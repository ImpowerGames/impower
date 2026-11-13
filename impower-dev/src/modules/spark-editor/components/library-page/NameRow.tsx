import { ListRow, TextField } from "@impower/impower-ui/components";
import type { ComponentChildren } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { closeWatcher } from "../desktop-shell";

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

  useLayoutEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  const cancel = () => {
    cancelled.current = true;
    const back = returnFocus?.();
    onCancel();
    if (back?.isConnected) {
      back.focus();
    }
  };
  const cancelRef = useRef(cancel);
  cancelRef.current = cancel;

  useEffect(() => closeWatcher(() => cancelRef.current()), []);

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
        <span class="flex h-[26px] min-w-0 items-center rounded-control border border-edge bg-bg focus-within:border-accent">
          <TextField
            ref={input}
            data-name-field="row"
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
                if (e.isComposing || e.keyCode === 229) {
                  return;
                }
                void commit(true);
              } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                cancel();
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
          <span id="scripts-name-error" role="alert" class="text-error">
            {error}
          </span>
        ) : undefined
      }
    />
  );
}
