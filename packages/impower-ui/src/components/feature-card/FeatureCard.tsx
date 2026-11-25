import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentChildren } from "preact";
import { cn } from "../../utils/cn";
import type { IconComponent } from "../icon/icons.generated";

export const featureCardVariants = cva("border border-solid border-edge bg-panel text-ink", {
  variants: {
    layout: {
      card: "flex flex-col items-start rounded-[14px] p-7 phone:p-[23px]",
      row: "flex items-center gap-4 rounded-[12px] px-5 py-3.5 phone:gap-3.5 phone:px-4",
    },
  },
  defaultVariants: {
    layout: "card",
  },
});

export type FeatureCardLayout = NonNullable<VariantProps<typeof featureCardVariants>["layout"]>;

export type FeatureCardProps = VariantProps<typeof featureCardVariants> & {
  icon: IconComponent;
  title: string;
  sentence: string;
  class?: string;
  children?: ComponentChildren;
};

export default function FeatureCard({
  icon: Icon,
  title,
  sentence,
  layout,
  class: className,
  children,
}: FeatureCardProps) {
  if (layout === "row") {
    return (
      <article class={cn(featureCardVariants({ layout }), className)}>
        <Icon aria-hidden="true" class="size-5 flex-none text-accent" />
        <div class="min-w-0">
          <h3 class="m-0 text-[14px]/[1.4] font-semibold">{title}</h3>
          <p class="m-0 text-caption text-muted">{sentence}</p>
        </div>
      </article>
    );
  }
  return (
    <article class={cn(featureCardVariants({ layout }), className)}>
      <Icon aria-hidden="true" class="size-7 flex-none text-accent" />
      <h2 class="mt-5 mb-1.5 text-[22px]/[1.25] font-semibold tracking-[-0.02em] phone:mt-[15px]">{title}</h2>
      <p class="m-0 text-body text-muted">{sentence}</p>
      {children}
    </article>
  );
}
