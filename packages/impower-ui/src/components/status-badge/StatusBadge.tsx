import { cva, type VariantProps } from "class-variance-authority";
import type { JSX, Ref } from "preact";
import { forwardRef } from "preact/compat";
import { cn } from "../../utils/cn";

export const statusBadgeVariants = cva(
  "pointer-events-none inline-block rounded-md border border-solid bg-paper px-2.5 py-1.5 font-sans text-[12px]/[1.4] font-normal",
  {
    variants: {
      tone: {
        default: "border-edge text-accent",
        error: "border-status-badge-error-edge text-error",
      },
    },
    defaultVariants: {
      tone: "default",
    },
  },
);

export type StatusBadgeTone = NonNullable<
  VariantProps<typeof statusBadgeVariants>["tone"]
>;

export type StatusBadgeProps = Omit<
  JSX.HTMLAttributes<HTMLSpanElement>,
  "role"
> &
  VariantProps<typeof statusBadgeVariants> & {
    class?: string;
  };

const StatusBadge = forwardRef<HTMLSpanElement, StatusBadgeProps>(
  function StatusBadge({ tone, class: className, ...rest }, ref) {
    return (
      <span
        ref={ref as Ref<HTMLSpanElement>}
        role="status"
        data-status-badge={tone ?? "default"}
        class={cn(statusBadgeVariants({ tone }), className)}
        {...rest}
      />
    );
  },
);

export default StatusBadge;
