import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentChildren, JSX } from "preact";
import { cn } from "../../utils/cn";

export const tileVariants = cva("group/tile relative h-full min-w-0", {
  variants: {
    shape: {
      portrait: "",
      landscape: "",
    },
  },
  defaultVariants: { shape: "landscape" },
});

export const tileMediaVariants = cva(
  "relative block w-full flex-none overflow-hidden rounded-[9px] bg-muted/12",
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

export type TileShape = NonNullable<VariantProps<typeof tileVariants>["shape"]>;
export type TileKind = NonNullable<VariantProps<typeof tileLabelVariants>["kind"]>;

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
  shape,
  kind,
  class: className,
  onClick,
  ...rest
}: TileProps) {
  return (
    <div class={cn(tileVariants({ shape }), className)} data-tile={shape ?? "landscape"}>
      <button
        type="button"
        class={cn(
          "control-overlay focus-inset flex h-full w-full min-w-0 cursor-pointer flex-col gap-[9px] rounded-[14px] border border-edge bg-panel/55 px-2 pt-2 pb-2.5 text-left hover:border-muted/45",
          current && "border-accent bg-tint",
        )}
        aria-current={current ? "true" : undefined}
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
        <span class="absolute top-2.5 right-2.5 z-10 flex rounded-full bg-bg/80 text-ink opacity-0 group-hover/tile:opacity-100 group-focus-within/tile:opacity-100 motion-safe:transition-opacity [:root[data-pointer=coarse]_&]:opacity-100">
          {actions}
        </span>
      )}
    </div>
  );
}
