import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentChildren, JSX } from "preact";
import { cn } from "../../utils/cn";
import { CheckIcon } from "../icon/icons.generated";
import type { ThumbnailFit } from "../thumbnail/Thumbnail";

export const tileVariants = cva("group/tile relative h-full min-w-0", {
  variants: {
    shape: {
      portrait: "",
      landscape: "",
    },
  },
  defaultVariants: { shape: "landscape" },
});

export const tileOpenVariants = cva(
  "control-overlay focus-inset flex h-full w-full min-w-0 cursor-pointer flex-col gap-[9px] rounded-[14px] border border-edge bg-panel/55 px-2 pt-2 pb-2.5 text-left hover:border-muted/45",
  {
    variants: {
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
    defaultVariants: { current: false, selection: "none", selected: false, dropTarget: false },
  },
);

export const tileMarkVariants = cva(
  [
    "absolute top-3.5 left-3.5 z-10 flex cursor-pointer items-center justify-center",
    "[&>span]:flex [&>span]:size-[22px] [&>span]:items-center [&>span]:justify-center [&>span]:rounded-full",
    "[&>span]:border-[1.5px] [&>span]:border-muted [&>span]:bg-bg/80 [&>span]:text-transparent [&_svg]:size-3.5",
    "has-checked:[&>span]:border-accent has-checked:[&>span]:bg-accent has-checked:[&>span]:text-accent-ink",
    "has-focus-visible:[&>span]:outline-1 has-focus-visible:[&>span]:outline-offset-2 has-focus-visible:[&>span]:outline-accent",
  ],
  {
    variants: {
      selection: {
        available:
          "pointer-events-none opacity-0 group-hover/tile:pointer-events-auto group-hover/tile:opacity-100 has-focus-visible:opacity-100",
        active: "",
      },
    },
    defaultVariants: { selection: "active" },
  },
);

export const tileMediaVariants = cva(
  "relative block w-full flex-none overflow-hidden rounded-[9px]",
  {
    variants: {
      shape: {
        portrait: "aspect-[3/4]",
        landscape: "aspect-[16/10]",
      },
    },
    defaultVariants: { shape: "landscape" },
  },
);

export const tileLabelVariants = cva("min-w-0 truncate text-[13px]/[18px] text-ink [--fade:20px] fade-edge", {
  variants: {
    kind: {
      file: "",
      folder: "font-semibold",
    },
  },
  defaultVariants: { kind: "file" },
});

export const tileActionsVariants = cva(
  "absolute top-2.5 right-2.5 z-10 flex rounded-full bg-bg/80 text-ink motion-safe:transition-opacity",
  {
    variants: {
      current: {
        true: "opacity-100",
        false: "opacity-0 group-hover/tile:opacity-100 group-focus-within/tile:opacity-100 [:root[data-pointer=coarse]_&]:opacity-100",
      },
    },
    defaultVariants: { current: false },
  },
);

export type TileShape = NonNullable<VariantProps<typeof tileVariants>["shape"]>;
export type TileSelection = NonNullable<VariantProps<typeof tileOpenVariants>["selection"]>;
export type TileKind = NonNullable<VariantProps<typeof tileLabelVariants>["kind"]>;

export const TILE_MEDIA_FIT: Record<TileShape, ThumbnailFit> = { portrait: "height", landscape: "contain" };

const MEDIA_RATIO: Record<TileShape, number> = { portrait: 4 / 3, landscape: 10 / 16 };

export const TILE_GAP = 12;

export const TILE_MIN_WIDTH: Record<TileShape, number> = { portrait: 138, landscape: 176 };

const FRAME = 2;
const INSET_X = 16;
const CHROME_Y = FRAME + 8 + 9 + 18 + 2 + 16 + 10;

export const tileHeight = (shape: TileShape, width: number): number =>
  Math.ceil(Math.max(0, width - FRAME - INSET_X) * MEDIA_RATIO[shape] + CHROME_Y);

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
  shape,
  kind,
  class: className,
  onClick,
  ...rest
}: TileProps) {
  return (
    <div
      class={cn(tileVariants({ shape }), className)}
      data-tile={shape ?? "landscape"}
      data-drop-target={dropTarget || undefined}
    >
      {selection !== "none" && (
        <label class={tileMarkVariants({ selection })}>
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
        class={cn(tileOpenVariants({ current, selection, selected, dropTarget }))}
        aria-current={current ? "true" : undefined}
        aria-pressed={selection === "active" ? selected : undefined}
        onClick={onClick}
        {...rest}
      >
        <span class={tileMediaVariants({ shape })}>
          {media}
          {badge && <span class="absolute right-1.5 bottom-1.5 z-10 flex">{badge}</span>}
        </span>
        <span class="flex min-w-0 flex-col gap-0.5 px-0.5">
          <span class={tileLabelVariants({ kind })}>{label}</span>
          {description && (
            <small class="min-w-0 truncate text-[11px]/[16px] text-muted [--fade:20px] fade-edge">
              {description}
            </small>
          )}
        </span>
      </button>
      {actions && (
        <span class={tileActionsVariants({ current })}>
          {actions}
        </span>
      )}
    </div>
  );
}
