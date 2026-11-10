import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { cn } from "../../utils/cn";
import { ImageIcon } from "../icon/icons.generated";

export const thumbnailVariants = cva(
  "relative flex flex-none items-center justify-center overflow-hidden bg-muted/12 text-muted",
  {
    variants: {
      size: {
        row: "size-11 rounded-md [&>svg]:size-5",
        card: "h-[52px] w-16 rounded-[5px] [&>svg]:size-[22px]",
        fill: "size-full [&>svg]:size-7",
      },
    },
    defaultVariants: { size: "row" },
  },
);

export const thumbnailImageVariants = cva("absolute inset-0 size-full", {
  variants: {
    fit: {
      cover: "object-cover",
      contain: "object-contain",
      top: "object-cover object-top",
    },
  },
  defaultVariants: { fit: "cover" },
});

export type ThumbnailSize = NonNullable<VariantProps<typeof thumbnailVariants>["size"]>;
export type ThumbnailFit = NonNullable<VariantProps<typeof thumbnailImageVariants>["fit"]>;

export type ThumbnailProps = VariantProps<typeof thumbnailVariants> &
  VariantProps<typeof thumbnailImageVariants> & {
    src?: string;
    alt?: string;
    glyph?: ComponentChildren;
    class?: string;
  };

export default function Thumbnail({ src, alt = "", size, fit, glyph, class: className }: ThumbnailProps) {
  const [failed, setFailed] = useState<string | undefined>(undefined);
  const broken = !src || failed === src;
  return (
    <span
      class={cn(thumbnailVariants({ size }), className)}
      data-thumbnail
      data-thumbnail-failed={src && broken ? "" : undefined}
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : "true"}
    >
      {broken ? (
        (glyph ?? <ImageIcon />)
      ) : (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          class={thumbnailImageVariants({ fit })}
          onError={() => setFailed(src)}
        />
      )}
    </span>
  );
}
