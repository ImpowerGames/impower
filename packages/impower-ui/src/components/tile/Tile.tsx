import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentChildren, JSX } from "preact";
import { cn } from "../../utils/cn";
import { CheckIcon } from "../icon/icons.generated";
import type { ThumbnailFit } from "../thumbnail/Thumbnail";
import type { VirtualListGrid } from "../virtual-list/VirtualList";

export const tileVariants = cva("group/tile relative h-full min-w-0", {
  variants: {
    size: {
      portrait: "",
      landscape: "",
      small: "",
    },
  },
  defaultVariants: { size: "landscape" },
});

export type TileSize = NonNullable<VariantProps<typeof tileVariants>["size"]>;

const FRAME = 2;

export const TILE_SIZES = {
  portrait: { ratio: 4 / 3, insetX: 16, chromeY: FRAME + 8 + 9 + 13 * 1.4 + 2 + 11 * 1.4 + 10, fit: "height" },
  landscape: { ratio: 10 / 16, insetX: 16, chromeY: FRAME + 8 + 9 + 13 * 1.4 + 2 + 11 * 1.4 + 10, fit: "contain" },
  small: { ratio: 1, insetX: 10, chromeY: FRAME + 5 + 6 + 11 * 1.4 + 7, fit: "contain" },
} as const satisfies Record<TileSize, { ratio: number; insetX: number; chromeY: number; fit: ThumbnailFit }>;

export const tileGridVariants = cva("", {
  variants: {
    size: {
      portrait:
        "[--grid-min-width:150px] [--grid-gap:10px] [:root[data-layout=desktop]_&]:[--grid-min-width:138px] [:root[data-layout=desktop]_&]:[--grid-gap:12px] [:root[data-layout=desktop]_&]:[@container_(max-width:440px)]:[--grid-min-width:140px]",
      landscape:
        "[--grid-min-width:160px] [--grid-gap:10px] [:root[data-layout=desktop]_&]:[--grid-min-width:176px] [:root[data-layout=desktop]_&]:[--grid-gap:12px] [:root[data-layout=desktop]_&]:[@container_(max-width:440px)]:[--grid-min-width:150px]",
      small: "[--grid-min-width:88px] [--grid-gap:8px] [:root[data-layout=desktop]_&]:[--grid-min-width:96px]",
    },
  },
  defaultVariants: { size: "landscape" },
});

export const tileHeight = (size: TileSize, width: number): number =>
  Math.max(0, width - FRAME - TILE_SIZES[size].insetX) * TILE_SIZES[size].ratio + TILE_SIZES[size].chromeY;

export const tileGrid = (size: TileSize): VirtualListGrid => ({
  class: tileGridVariants({ size }),
  height: (width) => tileHeight(size, width),
});

export const tileOpenVariants = cva(
  "control-overlay focus-inset flex h-full w-full min-w-0 cursor-pointer flex-col border border-edge bg-panel/55 text-left hover:border-muted/45",
  {
    variants: {
      size: {
        portrait: "gap-[9px] rounded-[14px] px-2 pt-2 pb-2.5",
        landscape: "gap-[9px] rounded-[14px] px-2 pt-2 pb-2.5",
        small: "gap-1.5 rounded-[10px] px-[5px] pt-[5px] pb-[7px]",
      },
      current: {
        true: "border-accent bg-tint hover:border-accent",
        false: "",
      },
      selection: {
        none: "",
        available: "select-none [-webkit-touch-callout:none]",
        active: "select-none [-webkit-touch-callout:none]",
      },
      selected: {
        true: "border-accent bg-tint ring-1 ring-inset ring-accent hover:border-accent",
        false: "",
      },
      dropTarget: {
        true: "border-accent bg-tint ring-1 ring-inset ring-accent hover:border-accent",
        false: "",
      },
    },
    defaultVariants: { size: "landscape", current: false, selection: "none", selected: false, dropTarget: false },
  },
);

export const tileMarkVariants = cva(
  [
    "absolute z-10 flex cursor-pointer items-center justify-center [:root[data-pointer=coarse]_&]:after:absolute",
    "[&>span]:flex [&>span]:items-center [&>span]:justify-center [&>span]:rounded-full",
    "[&>span]:border-[1.5px] [&>span]:border-muted [&>span]:bg-bg/80 [&>span]:text-transparent [&_svg]:size-3.5",
    "has-checked:[&>span]:border-accent has-checked:[&>span]:bg-accent has-checked:[&>span]:text-accent-ink",
    "has-focus-visible:[&>span]:outline-1 has-focus-visible:[&>span]:outline-offset-2 has-focus-visible:[&>span]:outline-accent",
  ],
  {
    variants: {
      size: {
        portrait: "top-3.5 left-3.5 [&>span]:size-[22px] [:root[data-pointer=coarse]_&]:after:-inset-[11px]",
        landscape: "top-3.5 left-3.5 [&>span]:size-[22px] [:root[data-pointer=coarse]_&]:after:-inset-[11px]",
        small: "top-[9px] left-[9px] [&>span]:size-[18px] [:root[data-pointer=coarse]_&]:after:-inset-[13px]",
      },
      selection: {
        available:
          "pointer-events-none opacity-0 group-hover/tile:pointer-events-auto group-hover/tile:opacity-100 has-focus-visible:opacity-100",
        active: "",
      },
    },
    defaultVariants: { size: "landscape", selection: "active" },
  },
);

export const tileMediaVariants = cva(
  "relative block w-full flex-none overflow-hidden rounded-[9px]",
  {
    variants: {
      size: {
        portrait: "aspect-[3/4]",
        landscape: "aspect-[16/10]",
        small: "aspect-square",
      },
    },
    defaultVariants: { size: "landscape" },
  },
);

export const tileLabelVariants = cva("min-w-0 text-ink [--fade:20px] fade-edge", {
  variants: {
    size: {
      portrait: "text-[13px]/[1.4]",
      landscape: "text-[13px]/[1.4]",
      small: "text-[11px]/[1.4]",
    },
    kind: {
      file: "",
      folder: "font-semibold",
    },
  },
  defaultVariants: { size: "landscape", kind: "file" },
});

export const tileDescriptionVariants = cva("min-w-0 text-[11px]/[1.4] text-muted [--fade:20px] fade-edge", {
  variants: {
    size: {
      portrait: "",
      landscape: "",
      small: "hidden",
    },
  },
  defaultVariants: { size: "landscape" },
});

export const tileActionsVariants = cva(
  "absolute z-10 flex rounded-full bg-bg/78 text-ink motion-safe:transition-opacity [&>button]:rounded-full [:root[data-pointer=coarse]_&]:[&>button]:size-11",
  {
    variants: {
      size: {
        portrait: "top-2.5 right-2.5 [&>button]:size-[34px]",
        landscape: "top-2.5 right-2.5 [&>button]:size-[34px]",
        small: "top-1.5 right-1.5 [&>button]:size-7",
      },
      current: {
        true: "opacity-100",
        false: "opacity-0 group-hover/tile:opacity-100 group-focus-within/tile:opacity-100 [:root[data-pointer=coarse]_&]:opacity-100",
      },
    },
    defaultVariants: { size: "landscape", current: false },
  },
);

export type TileSelection = NonNullable<VariantProps<typeof tileOpenVariants>["selection"]>;
export type TileKind = NonNullable<VariantProps<typeof tileLabelVariants>["kind"]>;

export type TileProps = VariantProps<typeof tileVariants> &
  VariantProps<typeof tileLabelVariants> & {
    media: ComponentChildren;
    badge?: ComponentChildren;
    label: ComponentChildren;
    description?: ComponentChildren;
    actions?: ComponentChildren;
    current?: boolean;
    selection?: TileSelection;
    selected?: boolean;
    selectLabel?: string;
    onSelectedChange?: (selected: boolean) => void;
    dropTarget?: boolean;
    class?: string;
    onClick?: (event: MouseEvent) => void;
  } & Omit<JSX.HTMLAttributes<HTMLButtonElement>, "class" | "label" | "onClick" | "size">;

export default function Tile({
  media,
  badge,
  label,
  description,
  actions,
  current = false,
  selection = "none",
  selected = false,
  selectLabel,
  onSelectedChange,
  dropTarget = false,
  size = "landscape",
  kind,
  class: className,
  onClick,
  ...rest
}: TileProps) {
  return (
    <div
      class={cn(tileVariants({ size }), className)}
      data-tile={size}
      data-drop-target={dropTarget || undefined}
    >
      {selection !== "none" && (
        <label class={tileMarkVariants({ size, selection })}>
          <input
            type="checkbox"
            class="sr-only"
            aria-label={selectLabel}
            checked={selected}
            onChange={(event) => onSelectedChange?.(event.currentTarget.checked)}
          />
          <span aria-hidden="true">
            <CheckIcon />
          </span>
        </label>
      )}
      <button
        type="button"
        class={cn(tileOpenVariants({ size, current, selection, selected, dropTarget }))}
        aria-current={current ? "true" : undefined}
        aria-pressed={selection === "active" ? selected : undefined}
        onClick={onClick}
        {...rest}
      >
        <span class={tileMediaVariants({ size })}>
          {media}
          {badge && <span class="absolute right-1.5 bottom-1.5 z-10 flex">{badge}</span>}
        </span>
        <span class="flex min-w-0 flex-col gap-0.5 px-0.5">
          <span class={tileLabelVariants({ size, kind })}>{label}</span>
          {description && <small class={tileDescriptionVariants({ size })}>{description}</small>}
        </span>
      </button>
      {actions && (
        <span class={tileActionsVariants({ size, current })}>
          {actions}
        </span>
      )}
    </div>
  );
}
