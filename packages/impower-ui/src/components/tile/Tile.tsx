import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentChildren, JSX } from "preact";
import { cn } from "../../utils/cn";
import { CheckIcon } from "../icon/icons.generated";
import type { ThumbnailFit } from "../thumbnail/Thumbnail";
import type { VirtualListGrid } from "../virtual-list/VirtualList";

export type TileTrack = "desktop" | "narrow" | "pane";

type TileSizeSpec = {
  track: Record<TileTrack, { minWidth: number; gap: number }>;
  ratio: number;
  padX: number;
  padTop: number;
  padBottom: number;
  gap: number;
  name: number;
  meta: boolean;
  fit: ThumbnailFit;
  classes: {
    open: string;
    media: string;
    label: string;
    description: string;
    mark: string;
    actions: string;
    notice: string;
  };
};

const FRAME = 2;
const LINE = 1.4;
const META = 11;
const META_GAP = 2;

export const TILE_SIZES = {
  portrait: {
    track: { desktop: { minWidth: 138, gap: 12 }, narrow: { minWidth: 150, gap: 10 }, pane: { minWidth: 140, gap: 12 } },
    ratio: 4 / 3,
    padX: 8,
    padTop: 8,
    padBottom: 10,
    gap: 9,
    name: 13,
    meta: true,
    fit: "height",
    classes: {
      open: "gap-[9px] rounded-[14px] px-2 pt-2 pb-2.5",
      media: "aspect-[3/4]",
      label: "text-[13px]/[1.4]",
      description: "",
      mark: "top-3.5 left-3.5 [&>span]:size-[22px] [:root[data-pointer=coarse]_&]:after:-inset-[11px]",
      actions: "top-2.5 right-2.5",
      notice: "px-2 py-1.5 text-[11px]/[1.35]",
    },
  },
  landscape: {
    track: { desktop: { minWidth: 176, gap: 12 }, narrow: { minWidth: 160, gap: 10 }, pane: { minWidth: 150, gap: 12 } },
    ratio: 10 / 16,
    padX: 8,
    padTop: 8,
    padBottom: 10,
    gap: 9,
    name: 13,
    meta: true,
    fit: "contain",
    classes: {
      open: "gap-[9px] rounded-[14px] px-2 pt-2 pb-2.5",
      media: "aspect-[16/10]",
      label: "text-[13px]/[1.4]",
      description: "",
      mark: "top-3.5 left-3.5 [&>span]:size-[22px] [:root[data-pointer=coarse]_&]:after:-inset-[11px]",
      actions: "top-2.5 right-2.5",
      notice: "px-2 py-1.5 text-[11px]/[1.35]",
    },
  },
  small: {
    track: { desktop: { minWidth: 96, gap: 8 }, narrow: { minWidth: 88, gap: 8 }, pane: { minWidth: 96, gap: 8 } },
    ratio: 1,
    padX: 5,
    padTop: 5,
    padBottom: 7,
    gap: 6,
    name: 11,
    meta: false,
    fit: "contain",
    classes: {
      open: "gap-1.5 rounded-[10px] px-[5px] pt-[5px] pb-[7px]",
      media: "aspect-square",
      label: "text-[11px]/[1.4]",
      description: "hidden",
      mark: "top-[9px] left-[9px] [&>span]:size-[18px] [:root[data-pointer=coarse]_&]:after:-inset-[13px]",
      actions: "top-1.5 right-1.5",
      notice: "-mx-1 -mt-1 px-1.5 py-0.5 text-[10px]/[1.3]",
    },
  },
} as const satisfies Record<string, TileSizeSpec>;

export type TileSize = keyof typeof TILE_SIZES;

const bySize = (part: keyof TileSizeSpec["classes"]): Record<TileSize, string> => ({
  portrait: TILE_SIZES.portrait.classes[part],
  landscape: TILE_SIZES.landscape.classes[part],
  small: TILE_SIZES.small.classes[part],
});

export const tileHeight = (size: TileSize, width: number): number => {
  const spec: TileSizeSpec = TILE_SIZES[size];
  const media = Math.max(0, width - FRAME - spec.padX * 2) * spec.ratio;
  const copy = spec.name * LINE + (spec.meta ? META_GAP + META * LINE : 0);
  return FRAME + spec.padTop + media + spec.gap + copy + spec.padBottom;
};

export const tileVariants = cva("group/tile relative h-full min-w-0", {
  variants: { size: { portrait: "", landscape: "", small: "" } },
  defaultVariants: { size: "landscape" },
});

export const tileGrid = (size: TileSize, track: TileTrack): VirtualListGrid => ({
  ...TILE_SIZES[size].track[track],
  height: (width) => tileHeight(size, width),
});

export const tileOpenVariants = cva(
  "control-overlay focus-inset flex h-full w-full min-w-0 cursor-pointer flex-col border border-edge bg-panel/55 text-left hover:border-muted/45",
  {
    variants: {
      size: bySize("open"),
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
      size: bySize("mark"),
      selection: {
        available:
          "pointer-events-none opacity-0 group-hover/tile:pointer-events-auto group-hover/tile:opacity-100 has-focus-visible:opacity-100",
        active: "",
      },
    },
    defaultVariants: { size: "landscape", selection: "active" },
  },
);

export const tileMediaVariants = cva("relative order-first block w-full flex-none overflow-hidden rounded-[9px]", {
  variants: { size: bySize("media") },
  defaultVariants: { size: "landscape" },
});

export const tileLabelVariants = cva("min-w-0 text-ink [--fade:20px] fade-edge", {
  variants: {
    size: bySize("label"),
    kind: {
      file: "",
      folder: "font-semibold",
    },
  },
  defaultVariants: { size: "landscape", kind: "file" },
});

export const tileDescriptionVariants = cva("min-w-0 text-[11px]/[1.4] text-muted [--fade:20px] fade-edge", {
  variants: { size: bySize("description") },
  defaultVariants: { size: "landscape" },
});

export const tileNoticeVariants = cva("min-h-0 overflow-auto rounded-[9px] bg-bg/92", {
  variants: { size: bySize("notice") },
  defaultVariants: { size: "landscape" },
});

export const tileActionsVariants = cva(
  "absolute z-10 flex rounded-full bg-bg/78 text-ink motion-safe:transition-opacity [&>button]:size-11 [&>button]:rounded-full",
  {
    variants: {
      size: bySize("actions"),
      current: {
        true: "opacity-100",
        false: "opacity-0 group-hover/tile:opacity-100 group-focus-within/tile:opacity-100 has-aria-expanded:opacity-100 [:root[data-pointer=coarse]_&]:opacity-100",
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
    editor?: ComponentChildren;
    notice?: ComponentChildren;
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
  editor,
  notice,
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
  const copy = (
    <span class={cn("flex min-w-0 flex-col gap-0.5 px-0.5", editor && "invisible")}>
      <span class={tileLabelVariants({ size, kind })}>{label}</span>
      {description && " "}
      {description && <small class={tileDescriptionVariants({ size })}>{description}</small>}
    </span>
  );
  const picture = (
    <span class={tileMediaVariants({ size })}>
      {media}
      {badge && <span class="absolute right-1.5 bottom-1.5 z-10 flex">{badge}</span>}
    </span>
  );
  return (
    <div
      class={cn(tileVariants({ size }), className)}
      data-tile={size}
      data-drop-target={dropTarget || undefined}
    >
      {selection !== "none" && !editor && (
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
      {editor ? (
        <div class={cn(tileOpenVariants({ size, current }), "relative cursor-auto hover:border-edge")}>
          {copy}
          {picture}
          <span class="absolute inset-0 z-10 flex min-w-0 flex-col justify-end gap-1 p-[inherit]">
            {notice && (
              <span class={tileNoticeVariants({ size })}>{notice}</span>
            )}
            <span class="flex min-w-0 flex-col px-0.5">{editor}</span>
          </span>
        </div>
      ) : (
        <button
          type="button"
          class={cn(tileOpenVariants({ size, current, selection, selected, dropTarget }))}
          aria-current={current ? "true" : undefined}
          aria-pressed={selection === "active" ? selected : undefined}
          onClick={onClick}
          {...rest}
        >
          {copy} {picture}
        </button>
      )}
      {actions && !editor && (
        <span class={tileActionsVariants({ size, current })}>
          {actions}
        </span>
      )}
    </div>
  );
}
