import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentChildren, JSX } from "preact";
import { cn } from "../../utils/cn";
import {
  CheckIcon,
  ErrorIcon,
  InfoIcon,
  WarningIcon,
} from "../icon/icons.generated";

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
        pressed: "bg-tint text-ink before:opacity-100",
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
      selection: {
        none: "",
        available: "select-none [-webkit-touch-callout:none]",
        active: "select-none [-webkit-touch-callout:none]",
      },
      selected: {
        true: "bg-tint",
        false: "",
      },
      dropTarget: {
        true: "bg-tint ring-2 ring-inset ring-accent",
        false: "",
      },
      indent: {
        content: "",
        row: "ml-[calc(var(--list-row-depth)_*_18px)] border-l-2 border-transparent before:left-0.5 before:inset-y-2",
      },
      highlight: {
        ink: "",
        accent: "",
      },
    },
    compoundVariants: [
      { state: "current", nested: true, class: "before:opacity-0" },
      { state: "none", tone: "muted", class: "text-muted" },
      { indent: "row", nested: true, class: "rounded-l-none [&>button]:rounded-l-none" },
      { indent: "row", nested: true, state: "current", class: "border-l-accent" },
      { state: "current", highlight: "accent", class: "text-accent" },
    ],
    defaultVariants: {
      state: "none",
      nested: false,
      tone: "ink",
      indent: "content",
      highlight: "ink",
      selection: "none",
      selected: false,
      dropTarget: false,
    },
  },
);

export const listRowBodyVariants = cva(
  [
    "relative flex h-full min-w-0 flex-1 items-center rounded-control text-left",
    "[&>svg]:flex-none",
    "[&>svg:last-child:not(:first-child)]:ml-auto [&>svg:last-child:not(:first-child)]:size-4",
  ],
  {
    variants: {
      size: {
        default:
          "min-h-[60px] gap-[13px] px-3 py-2.5 text-[14px]/[1.5] [&>svg:first-child]:size-[21px]",
        library:
          "min-h-[62px] gap-2.5 px-2 py-2 text-[14px]/[1.5] [&>svg:first-child]:size-[21px] [:root[data-layout=desktop]_&]:min-h-[60px] [:root[data-layout=desktop]_&]:gap-[13px] [:root[data-layout=desktop]_&]:px-3",
        compact:
          "min-h-[var(--list-row-compact-height)] gap-[var(--list-row-compact-gap)] px-[var(--list-row-compact-padding-x)] py-[var(--list-row-compact-padding-y)] text-[length:var(--list-row-compact-font-size)]/[1.4] [&>svg:first-child]:size-[18px]",
        block:
          "min-h-16 gap-3 px-2.5 py-2 text-[14px]/[1.4] [&>svg:first-child]:size-[22px]",
        dense:
          "min-h-[52px] gap-2.5 px-2.5 py-1.5 text-[14px]/[1.5] [&>svg:first-child]:size-[18px] [:root[data-layout=desktop]_&]:gap-[13px]",
        file:
          "min-h-[52px] gap-2.5 py-1 pr-0 pl-1.5 text-[13px]/[1.5] [&>svg:first-child]:mx-[5px] [&>svg:first-child]:size-[18px]",
        outline:
          "min-h-12 gap-2 py-1 pr-2 pl-2.5 text-[13px]/[1.6] [&>svg:first-child]:ml-[3px] [&>svg:first-child]:h-[18px] [&>svg:first-child]:w-[17px] [:root[data-layout=desktop]_&]:text-[14px]",
        rail:
          "min-h-11 gap-2 py-1 pr-2 pl-1.5 text-[12px]/[1.6] [&>svg:first-child]:ml-[3px] [&>svg:first-child]:h-[18px] [&>svg:first-child]:w-[17px]",
      },
      interactive: {
        true: "control-overlay cursor-pointer focus-inset",
        false: "",
      },
      selection: {
        none: "",
        available:
          "group-has-[input:focus-visible]/row:[&>svg:first-child]:invisible group-has-[input:focus-visible]/row:[&>[data-thumbnail]:first-child]:invisible",
        active: "[&>svg:first-child]:invisible [&>[data-thumbnail]:first-child]:invisible",
      },
      leading: {
        true: "pl-0",
        false: "",
      },
      iconControl: {
        true: "[&>svg:first-child]:invisible",
        false: "",
      },
      control: {
        true: "pl-[13px]",
        false: "",
      },
      glyph: {
        muted: "[&>svg]:text-muted",
        inherit: "",
      },
    },
    compoundVariants: [
      { size: "library", control: true, class: "pl-2.5 [:root[data-layout=desktop]_&]:pl-[13px]" },
    ],
    defaultVariants: { size: "default", interactive: true, selection: "none", leading: false, iconControl: false, control: false, glyph: "muted" },
  },
);

export const listRowMarkVariants = cva(
  [
    "absolute top-1/2 z-10 flex -translate-y-1/2 cursor-pointer items-center justify-center",
    "[&>span]:flex [&>span]:items-center [&>span]:justify-center [&>span]:rounded-full",
    "[&>span]:border-[1.5px] [&>span]:border-muted [&>span]:text-transparent",
    "has-checked:[&>span]:border-accent has-checked:[&>span]:bg-accent has-checked:[&>span]:text-accent-ink",
    "has-focus-visible:[&>span]:outline-1 has-focus-visible:[&>span]:outline-offset-2 has-focus-visible:[&>span]:outline-accent",
  ],
  {
    variants: {
      size: {
        default: "left-3 [&>span]:size-[21px] [&_svg]:size-3.5",
        library: "left-2 [&>span]:size-[21px] [&_svg]:size-3.5 [:root[data-layout=desktop]_&]:left-3 group-has-[[data-thumbnail]]/row:w-11",
        compact: "left-2 [&>span]:size-[18px] [&_svg]:size-3",
        block: "left-2.5 [&>span]:size-[22px] [&_svg]:size-3.5",
        dense: "left-2.5 [&>span]:size-[18px] [&_svg]:size-3",
        file: "left-[11px] [&>span]:size-[18px] [&_svg]:size-3",
        outline: "left-[13px] [&>span]:size-[18px] [&_svg]:size-3",
        rail: "left-[9px] [&>span]:size-[18px] [&_svg]:size-3",
      },
      selection: {
        available:
          "pointer-events-none opacity-0 has-focus-visible:pointer-events-auto has-focus-visible:opacity-100",
        active: "",
      },
      control: {
        true: "",
        false: "",
      },
    },
    compoundVariants: [
      { size: "library", control: true, class: "w-11" },
    ],
    defaultVariants: { size: "default", selection: "active", control: false },
  },
);

export const listRowIconControlVariants = cva(
  "pointer-events-none absolute inset-y-0 z-10 flex items-center justify-center [&>*]:pointer-events-auto",
  {
    variants: {
      size: {
        default: "left-3 w-[21px]",
        library: "left-2 w-[21px] [:root[data-layout=desktop]_&]:left-3",
        compact: "left-2 w-[18px]",
        block: "left-2.5 w-[22px]",
        dense: "left-2.5 w-[18px]",
        file: "left-[11px] w-[18px]",
        outline: "left-[13px] w-[17px]",
        rail: "left-[9px] w-[17px]",
      },
    },
    defaultVariants: { size: "default" },
  },
);

export const listRowControlVariants = cva("relative flex flex-none items-center", {
  variants: {
    size: {
      default: "pl-2",
      library: "pl-2 [:root[data-layout=desktop]_&]:pl-3",
      compact: "pl-1",
      block: "pl-2",
      dense: "pl-2",
      file: "pl-1",
      outline: "pl-1",
      rail: "pl-1",
    },
    selection: {
      none: "",
      available: "",
      active: "invisible",
    },
  },
  defaultVariants: { size: "default", selection: "none" },
});

export const listRowDescriptionVariants = cva("text-muted", {
  variants: {
    size: {
      default: "text-[11px]/[1.4]",
      library: "text-[11px]/[1.4]",
      compact: "text-[length:var(--list-row-compact-description-font-size)]/[1.4]",
      block: "text-[12px]/[1.5]",
      dense: "text-[11px]/[1.4]",
      file: "text-[11px]/[1.4]",
      outline: "text-[11px]/[1.4]",
      rail: "text-[11px]/[1.4]",
    },
    fit: {
      line: "[--fade:24px] fade-edge",
      wrap: "whitespace-normal break-words",
    },
  },
  defaultVariants: { size: "default", fit: "line" },
});

export const listRowLabelVariants = cva("min-w-0", {
  variants: {
    overflow: {
      fade: "[--fade:24px] fade-edge",
      clamp: "line-clamp-2 whitespace-normal",
      wrap: "whitespace-normal break-words",
      self: "",
    },
    size: {
      default: "",
      library: "",
      compact: "",
      block: "",
      dense: "",
      file: "",
      outline: "",
      rail: "",
    },
  },
  compoundVariants: [
    { size: "rail", overflow: "clamp", class: "leading-4 [overflow-wrap:anywhere]" },
  ],
  defaultVariants: { overflow: "fade", size: "default" },
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
export type ListRowDescriptionFit = NonNullable<
  VariantProps<typeof listRowDescriptionVariants>["fit"]
>;
export type ListRowSelection = NonNullable<
  VariantProps<typeof listRowVariants>["selection"]
>;
export type ListRowIndent = NonNullable<
  VariantProps<typeof listRowVariants>["indent"]
>;
export type ListRowHighlight = NonNullable<
  VariantProps<typeof listRowVariants>["highlight"]
>;
export type ListRowAfter = { depth: number; space: number };

export const LIST_ROW_INDENT = 18;

type ListRowLeadingProps = {
  leading?: ComponentChildren;
  selection?: never;
  selected?: never;
  selectLabel?: never;
  onSelectedChange?: never;
};

type ListRowSelectionProps = {
  leading?: never;
  selection?: ListRowSelection;
  selected?: boolean;
  selectLabel?: string;
  onSelectedChange?: (selected: boolean) => void;
};

export type ListRowProps = (ListRowLeadingProps | ListRowSelectionProps) & {
  icon?: ComponentChildren;
  iconControl?: ComponentChildren;
  control?: ComponentChildren;
  label: ComponentChildren;
  description?: ComponentChildren;
  descriptionFit?: ListRowDescriptionFit;
  trailing?: ComponentChildren;
  actions?: ComponentChildren;
  current?: boolean | "location";
  pressed?: boolean;
  containsCurrent?: boolean;
  depth?: number;
  indent?: ListRowIndent;
  after?: ListRowAfter;
  highlight?: ListRowHighlight;
  size?: ListRowSize;
  overflow?: ListRowLabelOverflow;
  tone?: ListRowTone;
  dropTarget?: boolean;
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

function RowGuides({
  depth,
  current,
  after,
}: {
  depth: number;
  current: boolean;
  after?: ListRowAfter;
}) {
  return (
    <>
      {Array.from({ length: depth }, (_, step) => {
        const level = depth - step;
        const tail = after && after.depth >= level ? after.space : 0;
        const own = step === 0 && current;
        if (own && !tail) {
          return null;
        }
        return (
          <span
            key={level}
            aria-hidden="true"
            data-list-row-guide={level}
            class="pointer-events-none absolute w-px bg-edge"
            style={{
              left: `${-2 - step * LIST_ROW_INDENT}px`,
              top: own ? "100%" : "0",
              bottom: `${-tail}px`,
            }}
          />
        );
      })}
    </>
  );
}

export default function ListRow({
  leading,
  icon,
  iconControl,
  control,
  label,
  description,
  descriptionFit,
  trailing,
  actions,
  current = false,
  pressed,
  containsCurrent = false,
  depth = 0,
  indent = "content",
  after,
  highlight = "ink",
  size,
  overflow,
  tone,
  selection = "none",
  selected = false,
  selectLabel,
  onSelectedChange,
  dropTarget = false,
  class: className,
  onClick,
  ...rest
}: ListRowProps) {
  const state: ListRowState = current
    ? "current"
    : pressed
      ? "pressed"
      : containsCurrent
      ? "contains-current"
      : "none";
  const copy = (
    <span class="flex min-w-0 flex-1 flex-col gap-[3px]">
      <span class={listRowLabelVariants({ overflow, size })}>
        {label}
      </span>
      {description && " "}
      {description && (
        <small class={listRowDescriptionVariants({ size, fit: descriptionFit })}>
          {description}
        </small>
      )}
    </span>
  );
  const interactive = !!onClick;
  const body = cn(listRowBodyVariants({
    size,
    interactive,
    selection,
    leading: !!leading,
    iconControl: !!iconControl,
    control: !!control,
    glyph:
      highlight === "accent" && (state === "current" || state === "contains-current")
        ? "inherit"
        : "muted",
  }));
  return (
    <div
      class={cn(
        listRowVariants({
          state,
          nested: depth > 0,
          tone,
          selection,
          selected,
          dropTarget,
          indent,
          highlight,
        }),
        className,
      )}
      style={indent === "row" ? { "--list-row-depth": depth } : undefined}
      data-drop-target={dropTarget || undefined}
    >
      {depth > 0 &&
        (indent === "row" ? (
          <RowGuides depth={depth} current={!!current} after={after} />
        ) : (
          <Guides depth={depth} current={!!current} />
        ))}
      {leading}
      {selection !== "none" && (
        <label class={cn(listRowMarkVariants({ size, selection, control: !!control }))}>
          <input
            type="checkbox"
            class="sr-only"
            aria-label={selectLabel}
            checked={selected}
            onChange={(event) =>
              onSelectedChange?.(event.currentTarget.checked)
            }
          />
          <span aria-hidden="true">
            <CheckIcon />
          </span>
        </label>
      )}
      {iconControl && (
        <span
          class={listRowIconControlVariants({ size })}
          style={depth > 0 && indent === "content" ? { marginLeft: `${depth * LIST_ROW_INDENT}px` } : undefined}
          data-list-row-icon-control
        >
          {iconControl}
        </span>
      )}
      {control && (
        <span class={listRowControlVariants({ size, selection })} data-list-row-control>
          {control}
        </span>
      )}
      {interactive ? (
        <button
          type="button"
          class={body}
          aria-current={
            current === "location" ? "location" : current ? "true" : undefined
          }
          aria-pressed={pressed ?? (selection === "active" ? selected : undefined)}
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
  "relative control-overlay flex flex-none cursor-pointer items-center justify-center rounded-control focus-inset [&>svg]:flex-none",
  {
    variants: {
      placement: {
        trailing: "h-[var(--control-size)] w-[var(--control-size)] self-center [&>svg]:size-[14px]",
        icon: "size-7 [&>svg]:size-[17px] [:root[data-pointer=coarse]_&]:size-11",
      },
    },
    defaultVariants: { placement: "trailing" },
  },
);

export type ListRowBadgeVariantProps = VariantProps<typeof listRowBadgeVariants>;

export type ListRowBadgeSeverity = "error" | "warning" | "note";

export type ListRowBadgeProps = {
  label: string;
  title?: string;
  severity: ListRowBadgeSeverity;
  placement?: NonNullable<ListRowBadgeVariantProps["placement"]>;
  onClick: (event: MouseEvent) => void;
  class?: string;
} & Omit<
  JSX.HTMLAttributes<HTMLButtonElement>,
  "class" | "icon" | "label" | "onClick" | "size" | "title"
>;

export function ListRowBadge({
  label,
  title,
  severity,
  placement,
  onClick,
  class: className,
  ...rest
}: ListRowBadgeProps) {
  return (
    <button
      type="button"
      data-list-row-badge
      data-severity={severity}
      aria-label={label}
      title={title ?? label}
      class={cn(listRowBadgeVariants({ placement }), className)}
      onClick={onClick}
      {...rest}
    >
      {severity === "error" ? (
        <ErrorIcon class="text-error" />
      ) : severity === "warning" ? (
        <WarningIcon class="text-warning" />
      ) : (
        <InfoIcon class="text-muted" />
      )}
    </button>
  );
}
