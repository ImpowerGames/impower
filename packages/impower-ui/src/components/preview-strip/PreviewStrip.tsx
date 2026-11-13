import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentChildren, JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { cn } from "../../utils/cn";
import { useToastLayer } from "../../utils/toastLayer";
import { FileIcon, PencilIcon } from "../icon/icons.generated";
import PlayButton from "../play-button/PlayButton";

export const previewStripVariants = cva(
  "@container relative flex h-[91px] w-full flex-none border-b border-edge bg-preview-strip text-ink",
);

export const previewStripStatusVariants = cva(
  [
    "-mx-2 -my-[11px] box-border flex min-h-11 w-max max-w-full cursor-pointer items-center gap-1.5",
    "rounded-[10px/15px] border-x-4 border-y-[9px] border-solid border-transparent bg-transparent bg-clip-padding px-1 py-0.5",
    "text-left text-[11px]/[1.4] [&_svg]:size-4 [&_svg]:flex-none",
    "hover:bg-tint focus-visible:outline-2 focus-visible:outline-accent",
  ],
  {
    variants: {
      tone: {
        error: "text-error",
        warning: "text-warning",
        info: "text-muted",
      },
    },
    defaultVariants: { tone: "warning" },
  },
);

export type PreviewStripTone = NonNullable<
  VariantProps<typeof previewStripStatusVariants>["tone"]
>;

export interface PreviewStripStatus {
  key: string;
  tone: PreviewStripTone;
  icon: ComponentChildren;
  text: string;
  label?: string;
  onPress: () => void;
}

export type PreviewStripSymbol = "file" | "pencil";

export type PreviewStripProps = {
  label: string;
  words: string;
  symbol?: PreviewStripSymbol;
  statuses?: PreviewStripStatus[];
  picture?: ComponentChildren;
  pictureLabel?: string;
  expanded?: boolean;
  onCollapse?: () => void;
  onPlay?: () => void;
  playDisabled?: boolean;
  class?: string;
} & Omit<JSX.HTMLAttributes<HTMLElement>, "label" | "class">;

const WORDS_CLAMP = ["line-clamp-2", "line-clamp-2", "line-clamp-1"] as const;

export default function PreviewStrip({
  label,
  words,
  symbol,
  statuses = [],
  picture,
  pictureLabel = "Game preview",
  expanded = false,
  onCollapse,
  onPlay,
  playDisabled = false,
  class: className,
  ...rest
}: PreviewStripProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const playRef = useRef<HTMLButtonElement | null>(null);
  const collapseRef = useRef(onCollapse);
  collapseRef.current = onCollapse;
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  const [live, setLive] = useState(false);
  const toastLayer = useToastLayer(expanded);

  useEffect(() => setLive(true), []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    const onCancel = (event: Event) => {
      event.preventDefault();
      collapseRef.current?.();
    };
    const onClose = () => {
      if (expandedRef.current) {
        collapseRef.current?.();
      }
    };
    dialog.addEventListener("cancel", onCancel);
    dialog.addEventListener("close", onClose);
    return () => {
      dialog.removeEventListener("cancel", onCancel);
      dialog.removeEventListener("close", onClose);
    };
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (expanded && !dialog.open) {
      dialog.showModal();
    } else if (!expanded && dialog.open) {
      const active = document.activeElement;
      const hadFocus = !active || active === document.body || dialog.contains(active);
      dialog.close();
      // workaround(chromium): a dialog leaving the top layer keeps no layout boxes for its contents until it is displayed again (seen with Chrome 124.0.6367.219)
      dialog.style.display = "none";
      void dialog.offsetHeight;
      dialog.style.removeProperty("display");
      if (hadFocus) {
        playRef.current?.focus({ preventScroll: true });
      }
    }
  }, [expanded]);

  const shown = statuses.slice(0, 2);

  return (
    <section
      aria-label="Preview"
      data-preview-strip=""
      data-symbol={symbol}
      class={cn(previewStripVariants(), className)}
      {...rest}
    >
      <div class="flex h-full w-full min-w-0 items-center gap-3 py-[9px] pr-[max(20px,env(safe-area-inset-right))] pl-3 @max-[380px]:gap-[9px] @max-[380px]:pl-[11px]">
        <div
          data-preview-strip-picture=""
          class="relative h-[72px] w-[98px] flex-none overflow-hidden rounded-[7px] border border-solid border-edge bg-stage @max-[380px]:w-[88px]"
        >
          <dialog
            ref={dialogRef}
            data-portal-host=""
            data-expanded={expanded ? "" : undefined}
            aria-label={pictureLabel}
            inert={!expanded}
            class={cn(
              "m-0 block max-h-none max-w-none overflow-hidden border-0 p-0 text-ink backdrop:bg-stage",
              expanded
                ? "fixed inset-0 h-full w-full bg-preview-mat"
                : "pointer-events-none absolute top-0 left-0 h-[600%] w-[600%] origin-top-left scale-[0.1666667] bg-stage",
            )}
          >
            {picture}
            <div ref={toastLayer} data-toast-layer class="contents" />
          </dialog>
          {symbol ? (
            <span
              aria-hidden="true"
              data-preview-strip-symbol={symbol}
              class="absolute inset-0 flex items-center justify-center bg-panel text-accent [&_svg]:size-[30px]"
            >
              {symbol === "pencil" ? <PencilIcon /> : <FileIcon />}
            </span>
          ) : null}
        </div>
        <div
          data-preview-strip-copy=""
          class="flex min-w-0 flex-1 flex-col items-start"
        >
          <b class="mb-[2px] block w-full truncate text-[10px]/[1.4] font-bold tracking-[0.06em] text-ink">
            {label}
          </b>
          <p
            class={cn(
              "w-full text-[12px]/[1.4] break-words text-muted",
              WORDS_CLAMP[shown.length],
            )}
          >
            {words}
          </p>
          {shown.map((status) => (
            <button
              key={status.key}
              type="button"
              aria-label={status.label}
              title={status.label ?? status.text}
              data-preview-strip-status={status.key}
              class={previewStripStatusVariants({ tone: status.tone })}
              onClick={status.onPress}
            >
              {status.icon}
              <span class="min-w-0 truncate">{status.text}</span>
            </button>
          ))}
        </div>
        <PlayButton
          ref={playRef}
          name="from this line"
          size="strip"
          ring="accent"
          disabled={playDisabled || !live}
          onClick={onPlay}
        />
      </div>
    </section>
  );
}
