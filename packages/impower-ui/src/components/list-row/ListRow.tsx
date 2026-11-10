import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentChildren, JSX } from "preact";
import { cn } from "../../utils/cn";

export const listRowVariants = cva(
  [
    "group/row relative flex h-full min-w-0 items-center rounded-control",
    "before:pointer-events-none before:absolute before:inset-y-3 before:left-0 before:w-0.5 before:rounded-sm before:bg-accent before:opacity-0",
  ],
  {
    variants: {
      state: {
        none: "text-ink",
        current: "bg-tint text-ink before:opacity-100",
        "contains-current": "text-accent",
      },
      nested: {
        true: "",
        false: "",
      },
      tone: {
        ink: "",
        muted: "",
      },
    },
    compoundVariants: [
      { state: "current", nested: true, class: "before:opacity-0" },
      { state: "none", tone: "muted", class: "text-muted" },
    ],
    defaultVariants: { state: "none", nested: false, tone: "ink" },
  },
);

export const listRowBodyVariants = cva(
  [
    "relative flex h-full min-w-0 flex-1 items-center rounded-control text-left",
    "[&>svg]:flex-none [&>svg]:text-muted",
    "[&>svg:last-child:not(:first-child)]:ml-auto [&>svg:last-child:not(:first-child)]:size-4",
  ],
  {
    variants: {
      size: {
        default:
          "min-h-[60px] gap-[13px] px-3 py-2.5 text-[14px]/[1.5] [&>svg:first-child]:size-[21px]",
        compact:
          "min-h-11 gap-2.5 px-2 py-1 text-[12px]/[1.4] [&>svg:first-child]:size-[18px]",
        block:
          "min-h-16 gap-3 px-2.5 py-2 text-[14px]/[1.4] [&>svg:first-child]:size-[22px]",
      },
      interactive: {
        true: "control-overlay cursor-pointer focus-inset",
        false: "",
      },
      leading: {
        true: "pl-0",
        false: "",
      },
    },
    defaultVariants: { size: "default", interactive: true, leading: false },
  },
);

export const listRowDescriptionVariants = cva(
  "text-muted [--fade:24px] fade-edge",
  {
    variants: {
      size: {
        default: "text-[11px]/[1.4]",
        compact: "text-[11px]/[1.4]",
        block: "text-[12px]/[1.5]",
      },
    },
    defaultVariants: { size: "default" },
  },
);

export const listRowLabelVariants = cva("min-w-0", {
  variants: {
    overflow: {
      fade: "[--fade:24px] fade-edge",
      clamp: "line-clamp-2 whitespace-normal",
    },
  },
  defaultVariants: { overflow: "fade" },
});

export type ListRowSize = NonNullable<
  VariantProps<typeof listRowBodyVariants>["size"]
>;
export type ListRowState = NonNullable<
  VariantProps<typeof listRowVariants>["state"]
>;
export type ListRowTone = NonNullable<
  VariantProps<typeof listRowVariants>["tone"]
>;
export type ListRowLabelOverflow = NonNullable<
  VariantProps<typeof listRowLabelVariants>["overflow"]
>;

export const LIST_ROW_INDENT = 18;

export type ListRowProps = {
  leading?: ComponentChildren;
  icon?: ComponentChildren;
  label: ComponentChildren;
  description?: ComponentChildren;
  trailing?: ComponentChildren;
  actions?: ComponentChildren;
  current?: boolean | "location";
  containsCurrent?: boolean;
  depth?: number;
  size?: ListRowSize;
  overflow?: ListRowLabelOverflow;
  tone?: ListRowTone;
  class?: string;
  onClick?: (event: MouseEvent) => void;
} & Omit<
  JSX.HTMLAttributes<HTMLButtonElement>,
  "class" | "icon" | "label" | "onClick" | "size"
>;

function Guides({ depth, current }: { depth: number; current: boolean }) {
  return (
    <span
      aria-hidden="true"
      class="relative flex-none self-stretch"
      style={{ width: `${depth * LIST_ROW_INDENT}px` }}
    >
      {depth > 1 && (
        <span
          class="absolute inset-y-0 left-[9px] bg-[repeating-linear-gradient(to_right,var(--edge)_0_1px,transparent_1px_18px)]"
          style={{ width: `${(depth - 1) * LIST_ROW_INDENT}px` }}
        />
      )}
      <span
        class={cn(
          "absolute inset-y-0 w-px",
          current ? "bg-accent" : "bg-edge",
        )}
        style={{ left: `${(depth - 1) * LIST_ROW_INDENT + 9}px` }}
      />
    </span>
  );
}

export default function ListRow({
  leading,
  icon,
  label,
  description,
  trailing,
  actions,
  current = false,
  containsCurrent = false,
  depth = 0,
  size,
  overflow,
  tone,
  class: className,
  onClick,
  ...rest
}: ListRowProps) {
  const state: ListRowState = current
    ? "current"
    : containsCurrent
      ? "contains-current"
      : "none";
  const copy = (
    <span class="flex min-w-0 flex-1 flex-col gap-[3px]">
      <span
        class={cn(
          typeof label === "string" && listRowLabelVariants({ overflow }),
        )}
      >
        {label}
      </span>
      {description && (
        <small class={listRowDescriptionVariants({ size })}>
          {description}
        </small>
      )}
    </span>
  );
  const interactive = !!onClick;
  const body = listRowBodyVariants({ size, interactive, leading: !!leading });
  return (
    <div
      class={cn(listRowVariants({ state, nested: depth > 0, tone }), className)}
    >
      {depth > 0 && <Guides depth={depth} current={!!current} />}
      {leading}
      {interactive ? (
        <button
          type="button"
          class={body}
          aria-current={
            current === "location" ? "location" : current ? "true" : undefined
          }
          onClick={onClick}
          {...rest}
        >
          {icon}
          {copy}
          {trailing}
        </button>
      ) : (
        <div class={body}>
          {icon}
          {copy}
          {trailing}
        </div>
      )}
      {actions}
    </div>
  );
}

export const listRowBadgeVariants = cva(
  "relative control-overlay flex h-full flex-none cursor-pointer items-center rounded-control focus-inset [&>svg]:flex-none",
  {
    variants: {
      size: {
        default: "w-[46px] pl-3 [&>svg]:size-[21px]",
        compact: "w-9 pl-2 [&>svg]:size-[18px]",
        block: "w-[46px] pl-2.5 [&>svg]:size-[22px]",
      },
    },
    defaultVariants: { size: "default" },
  },
);

export type ListRowBadgeProps = {
  label: string;
  title?: string;
  icon: ComponentChildren;
  size?: ListRowSize;
  onClick: (event: MouseEvent) => void;
  class?: string;
} & Omit<
  JSX.HTMLAttributes<HTMLButtonElement>,
  "class" | "icon" | "label" | "onClick" | "size" | "title"
>;

export function ListRowBadge({
  label,
  title,
  icon,
  size,
  onClick,
  class: className,
  ...rest
}: ListRowBadgeProps) {
  return (
    <button
      type="button"
      data-list-row-badge
      aria-label={label}
      title={title ?? label}
      class={cn(listRowBadgeVariants({ size }), className)}
      onClick={onClick}
      {...rest}
    >
      {icon}
    </button>
  );
}
