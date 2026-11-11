import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentChildren } from "preact";
import { cn } from "../../utils/cn";
import {
  ArrowIcon,
  ErrorIcon,
  InfoIcon,
  WarningIcon,
} from "../icon/icons.generated";

export const messageEntryVariants = cva(
  "flex min-w-0 flex-col border-b border-solid border-edge/40",
  {
    variants: {
      fit: {
        flow: "",
        row: "h-full overflow-hidden",
      },
    },
    defaultVariants: { fit: "flow" },
  },
);

export const messageEntryGlyphVariants = cva(
  "mt-px size-[17px] flex-none",
  {
    variants: {
      severity: {
        error: "text-error",
        warning: "text-warning",
        info: "text-muted",
      },
    },
    defaultVariants: { severity: "info" },
  },
);

const titleVariants = cva("text-[13px]/[1.4] font-semibold text-ink", {
  variants: {
    fit: {
      flow: "[overflow-wrap:anywhere]",
      row: "[--fade:24px] fade-edge",
    },
  },
  defaultVariants: { fit: "flow" },
});

const textVariants = cva(
  "text-[12px]/[1.5] text-muted [overflow-wrap:anywhere]",
  {
    variants: {
      fit: {
        flow: "",
        row: "line-clamp-2 min-h-[3em]",
      },
    },
    defaultVariants: { fit: "flow" },
  },
);

export const MESSAGE_ENTRY_ROW_HEIGHT = {
  plain: 74,
  message: 114,
} as const;

export type MessageEntrySeverity = NonNullable<
  VariantProps<typeof messageEntryGlyphVariants>["severity"]
>;
export type MessageEntryFit = NonNullable<
  VariantProps<typeof messageEntryVariants>["fit"]
>;

const GLYPHS = {
  error: ErrorIcon,
  warning: WarningIcon,
  info: InfoIcon,
} as const;

export type MessageEntryProps = VariantProps<typeof messageEntryVariants> & {
  severity: MessageEntrySeverity;
  title: string;
  prefix?: string;
  message?: string;
  location?: string;
  locationLabel?: string;
  onJump?: () => void;
  time?: { label: string; dateTime: string };
  actions?: ComponentChildren;
  onActivate?: () => void;
  class?: string;
};

export default function MessageEntry({
  severity,
  title,
  prefix,
  message,
  location,
  locationLabel,
  onJump,
  time,
  actions,
  onActivate,
  fit,
  class: className,
}: MessageEntryProps) {
  const Glyph = GLYPHS[severity];
  return (
    <div
      data-message-entry={severity}
      data-activatable={onActivate ? "" : undefined}
      class={cn(
        messageEntryVariants({ fit }),
        onActivate && "relative control-overlay cursor-pointer",
        className,
      )}
      onClick={
        onActivate
          ? (event) => {
              if (!(event.target as Element).closest("button, a")) {
                onActivate();
              }
            }
          : undefined
      }
    >
      <div
        class={cn(
          "flex min-w-0 items-start gap-2.5 px-2 pt-3 pb-0.5",
          onActivate ? "cursor-pointer" : "cursor-text select-text",
        )}
      >
        <Glyph class={messageEntryGlyphVariants({ severity })} aria-hidden="true" />
        <span class="grid min-w-0 flex-1 gap-1">
          <strong
            class={titleVariants({ fit })}
            title={fit === "row" ? `${prefix ?? ""}${title}` : undefined}
          >
            {prefix}
            {title}
          </strong>
          {message ? (
            <span
              class={textVariants({ fit })}
              title={fit === "row" ? message : undefined}
            >
              {message}
            </span>
          ) : null}
        </span>
      </div>
      <div class="flex min-h-9 items-center justify-between gap-2 pr-2 pb-2 pl-[35px]">
        {location ? (
          <button
            type="button"
            class="relative control-overlay -ml-2 inline-flex min-h-8 min-w-0 cursor-pointer items-center gap-1.5 rounded-control px-2 text-[11px]/[1.5] text-accent [&>svg]:size-[13px] [&>svg]:flex-none"
            aria-label={locationLabel}
            onClick={onJump}
          >
            <span class="min-w-0 [overflow-wrap:anywhere]">{location}</span>
            <ArrowIcon aria-hidden="true" />
          </button>
        ) : (
          <span />
        )}
        {time || actions ? (
          <span class="ml-auto flex flex-none items-center gap-2">
            {time ? (
              <time
                class="text-[10px] whitespace-nowrap text-muted"
                dateTime={time.dateTime}
              >
                {time.label}
              </time>
            ) : null}
            {actions}
          </span>
        ) : null}
      </div>
    </div>
  );
}
