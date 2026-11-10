import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentChildren } from "preact";
import { cn } from "../../utils/cn";
import { ChevronDownIcon } from "../icon/icons.generated";

export const PANEL_CARD_HEIGHT = {
  head: 50,
  end: 15,
  note: 52,
} as const;

export const panelCardHeadVariants = cva(
  "relative flex h-[42px] items-center justify-end border border-solid border-edge bg-paper",
  {
    variants: {
      open: {
        true: "rounded-t-[10px]",
        false: "rounded-[10px]",
      },
    },
    defaultVariants: { open: true },
  },
);

const toggleVariants = cva(
  [
    "control-wash absolute inset-0 inline-flex cursor-pointer items-center gap-2 px-2.5 text-left",
    "text-[11px]/[1.4] font-semibold tracking-[0.06em] uppercase outline-offset-[-3px]",
    "[&>svg]:size-3.5 [&>svg]:flex-none [&>svg]:motion-safe:transition-transform [&>svg]:motion-safe:duration-180",
  ],
  {
    variants: {
      open: {
        true: "rounded-t-[9px] text-ink",
        false: "rounded-[9px] text-muted [&>svg]:-rotate-90",
      },
      actions: {
        true: "pr-[124px]",
        false: "",
      },
    },
    defaultVariants: { open: true, actions: false },
  },
);

export const panelCardRowVariants = cva(
  "h-full border-x border-solid border-edge bg-paper",
  {
    variants: {
      part: {
        body: "px-1",
        end: "mb-2 h-[7px] rounded-b-[10px] border-b",
      },
    },
    defaultVariants: { part: "body" },
  },
);

export type PanelCardRowPart = NonNullable<
  VariantProps<typeof panelCardRowVariants>["part"]
>;

export type PanelCardHeadProps = {
  title: string;
  count?: { text: string; spoken: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  controls?: string;
  actions?: ComponentChildren;
  class?: string;
};

export function PanelCardHead({
  title,
  count,
  open,
  onOpenChange,
  controls,
  actions,
  class: className,
}: PanelCardHeadProps) {
  return (
    <div class={cn("pt-2", className)}>
      <div class={panelCardHeadVariants({ open })}>
        <button
          type="button"
          class={toggleVariants({ open, actions: !!actions })}
          aria-expanded={open}
          aria-controls={controls}
          aria-label={count?.spoken ? `${title}, ${count.spoken}` : title}
          onClick={() => onOpenChange(!open)}
        >
          <ChevronDownIcon />
          <span>{title}</span>
          {count?.text ? (
            <small
              aria-hidden="true"
              class="text-[11px] font-normal tracking-normal text-muted normal-case"
            >
              {count.text}
            </small>
          ) : null}
        </button>
        {actions ? (
          <div
            role="group"
            aria-label={title}
            class="relative z-[1] flex flex-none gap-0.5 px-1 py-0.5"
          >
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export type PanelCardRowProps = VariantProps<typeof panelCardRowVariants> & {
  children?: ComponentChildren;
  class?: string;
};

export function PanelCardRow({ part, children, class: className }: PanelCardRowProps) {
  return <div class={cn(panelCardRowVariants({ part }), className)}>{children}</div>;
}

export type PanelCardNoteProps = {
  children: ComponentChildren;
  class?: string;
};

export function PanelCardNote({ children, class: className }: PanelCardNoteProps) {
  return (
    <PanelCardRow part="body" class={className}>
      <p class="m-0 px-2 py-4 text-[13px]/[1.5] text-muted">{children}</p>
    </PanelCardRow>
  );
}

export type PanelCardActionProps = {
  label: string;
  icon: ComponentChildren;
  onClick: () => void;
  disabled?: boolean;
  class?: string;
};

export function PanelCardAction({
  label,
  icon,
  onClick,
  disabled,
  class: className,
}: PanelCardActionProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      class={cn(
        "relative control-overlay inline-flex size-9 cursor-pointer items-center justify-center rounded-control text-muted disabled:cursor-default disabled:opacity-40 [&>svg]:size-4",
        className,
      )}
      onClick={onClick}
    >
      {icon}
    </button>
  );
}
