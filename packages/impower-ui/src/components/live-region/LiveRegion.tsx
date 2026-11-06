import { cva, type VariantProps } from "class-variance-authority";
import { announcement } from "../../hooks/useAnnouncer";
import { cn } from "../../utils/cn";

export const liveRegionVariants = cva("", {
  variants: {
    visibility: {
      hidden: "sr-only",
      visible: "text-caption text-muted",
    },
  },
  defaultVariants: {
    visibility: "hidden",
  },
});

export type LiveRegionVisibility = NonNullable<
  VariantProps<typeof liveRegionVariants>["visibility"]
>;

export type LiveRegionProps = VariantProps<typeof liveRegionVariants> & {
  class?: string;
};

export default function LiveRegion({ visibility, class: className }: LiveRegionProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-live-region
      class={cn(liveRegionVariants({ visibility }), className)}
    >
      {announcement.value}
    </div>
  );
}
