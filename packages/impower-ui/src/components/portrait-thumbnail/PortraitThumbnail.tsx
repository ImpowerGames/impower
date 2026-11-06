import { cva, type VariantProps } from "class-variance-authority";
import { useState } from "preact/hooks";
import { cn } from "../../utils/cn";

const visiblePercent = (value: number): number =>
  Number.isFinite(value) ? Math.max(1, Math.min(100, Math.round(value))) : 100;

export const portraitCropLabel = (value: number): string => {
  const crop = visiblePercent(value);
  return crop === 100 ? "Whole image" : `Top ${crop}%`;
};

export const portraitThumbnailVariants = cva(
  "flex items-center justify-center overflow-hidden bg-paper [container-type:size]",
  {
    variants: {
      size: {
        tile: "h-[52px] w-16 rounded-[5px]",
        example: "h-[152px] w-full rounded-lg border border-solid border-edge",
        fill: "h-full w-full",
      },
    },
    defaultVariants: {
      size: "tile",
    },
  },
);

export type PortraitThumbnailSize = NonNullable<
  VariantProps<typeof portraitThumbnailVariants>["size"]
>;

export type PortraitThumbnailProps = VariantProps<
  typeof portraitThumbnailVariants
> & {
  src?: string;
  crop: number;
  alt?: string;
  class?: string;
};

export default function PortraitThumbnail({
  src,
  crop,
  alt = "",
  size,
  class: className,
}: PortraitThumbnailProps) {
  const [natural, setNatural] = useState<{
    src: string;
    width: number;
    height: number;
  }>();
  const visible = visiblePercent(crop);
  const known = src && natural?.src === src ? natural : undefined;
  const ratio = known
    ? known.width / ((known.height * visible) / 100)
    : undefined;
  return (
    <span
      class={cn(portraitThumbnailVariants({ size }), className)}
      data-portrait-thumbnail
      data-visible-percent={visible}
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : "true"}
    >
      <span
        class={cn(
          "relative block shrink-0 overflow-hidden",
          ratio
            ? "aspect-(--portrait-ratio) w-[min(100cqw,calc(100cqh*var(--portrait-ratio)))]"
            : "h-full w-full",
        )}
        style={ratio ? { "--portrait-ratio": String(ratio) } : undefined}
      >
        {src && (
          <img
            src={src}
            alt=""
            class={cn(
              "block max-w-none",
              ratio ? "h-auto w-full" : "h-full w-full object-cover object-top",
            )}
            onLoad={(event) => {
              const image = event.currentTarget;
              if (image.naturalWidth && image.naturalHeight) {
                setNatural({
                  src,
                  width: image.naturalWidth,
                  height: image.naturalHeight,
                });
              }
            }}
          />
        )}
      </span>
    </span>
  );
}
