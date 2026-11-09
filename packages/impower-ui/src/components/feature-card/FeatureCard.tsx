import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentChildren } from "preact";
import { cn } from "../../utils/cn";
import type { IconComponent } from "../icon/icons.generated";

export const featureCardVariants = cva(
  "flex flex-col items-start rounded-[14px] border border-solid border-edge bg-panel text-ink",
  {
    variants: {
      size: {
        default: "p-7 phone:p-[23px]",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

export type FeatureCardSize = NonNullable<VariantProps<typeof featureCardVariants>["size"]>;

export type FeatureCardProps = VariantProps<typeof featureCardVariants> & {
  icon: IconComponent;
  title: string;
  sentence: string;
  tag?: string;
  class?: string;
  children?: ComponentChildren;
};

export default function FeatureCard({
  icon: Icon,
  title,
  sentence,
  tag,
  size,
  class: className,
  children,
}: FeatureCardProps) {
  return (
    <article class={cn(featureCardVariants({ size }), className)}>
      <Icon aria-hidden="true" class="size-7 flex-none text-accent" />
      <h2 class="mt-5 mb-2.5 text-[22px]/[1.25] font-semibold tracking-[-0.02em] phone:mt-[15px]">{title}</h2>
      <p class="m-0 min-h-[68px] text-body text-muted phone:min-h-0">{sentence}</p>
      {children}
      {tag && (
        <span class="mt-[18px] inline-block rounded-[5px] bg-elevated px-[9px] py-[5px] text-tag text-muted">
          {tag}
        </span>
      )}
    </article>
  );
}
