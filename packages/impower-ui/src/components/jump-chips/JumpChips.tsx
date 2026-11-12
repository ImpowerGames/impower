import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../utils/cn";
import type { RailIndexGroup } from "../rail-index/RailIndex";

export const jumpChipVariants = cva(
  [
    "relative control-overlay inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap select-none",
    "rounded-full border border-solid border-edge bg-transparent text-ink",
    "motion-safe:transition-[background-color,border-color] motion-safe:duration-140",
  ],
  {
    variants: {
      size: {
        default: "min-h-9 px-3 py-1.5 text-[13px]/[1.4] font-semibold",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

export type JumpChipSize = NonNullable<VariantProps<typeof jumpChipVariants>["size"]>;

export type JumpChipsProps = VariantProps<typeof jumpChipVariants> & {
  label: string;
  groups: readonly RailIndexGroup[];
  onJump: (id: string) => void;
  class?: string;
};

export default function JumpChips({ label, groups, onJump, size, class: className }: JumpChipsProps) {
  return (
    <nav aria-label={label} class={className}>
      <div
        class={cn(
          "flex items-center gap-1.5 scroller-x pt-0.5 pr-8 pb-1.5",
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,#000_calc(100%-32px),transparent)]",
        )}
      >
        {groups
          .filter((group) => group.items.length > 0)
          .map((group) => (
            <div
              key={group.id}
              role="group"
              aria-label={group.label}
              class="flex shrink-0 gap-1.5 [&+&]:ml-1.5 [&+&]:border-l [&+&]:border-solid [&+&]:border-edge [&+&]:pl-3"
            >
              {group.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  class={jumpChipVariants({ size })}
                  data-index-jump={item.id}
                  onClick={() => onJump(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ))}
      </div>
    </nav>
  );
}
