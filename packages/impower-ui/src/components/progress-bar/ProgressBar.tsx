import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../utils/cn";

export const progressBarVariants = cva(
  "relative block h-1.5 w-full overflow-hidden rounded-full bg-edge",
  {
    variants: {
      tone: {
        accent: "text-accent",
        faded: "text-muted opacity-40",
      },
    },
    defaultVariants: { tone: "accent" },
  },
);

export const progressBarFillVariants = cva("absolute inset-y-0 left-0 rounded-full bg-current", {
  variants: {
    measured: {
      true: "motion-safe:transition-[width] motion-safe:duration-150 motion-safe:ease-out",
      false: [
        "w-2/5",
        "motion-safe:animate-[impower-progress-sweep_1.4s_cubic-bezier(0.37,0,0.63,1)_infinite]",
      ],
    },
  },
  defaultVariants: { measured: true },
});

export type ProgressBarTone = NonNullable<VariantProps<typeof progressBarVariants>["tone"]>;

export type ProgressBarProps = VariantProps<typeof progressBarVariants> & {
  value?: number;
  label: string;
  class?: string;
};

const KEYFRAMES = `
@keyframes impower-progress-sweep {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(250%); }
}
`;

export default function ProgressBar({ value, label, tone, class: className }: ProgressBarProps) {
  const measured = value !== undefined;
  const percent = measured ? Math.round(Math.min(1, Math.max(0, value)) * 100) : undefined;
  return (
    <span
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-busy={measured ? undefined : "true"}
      class={cn(progressBarVariants({ tone }), className)}
      data-progress-bar
    >
      {!measured && <style>{KEYFRAMES}</style>}
      <span
        class={progressBarFillVariants({ measured })}
        style={measured ? { width: `${percent}%` } : undefined}
      />
    </span>
  );
}
