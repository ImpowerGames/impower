import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentChildren } from "preact";
import { cn } from "../../utils/cn";
import Button from "../button/Button";
import { BackIcon } from "../icon/icons.generated";

export const pageFrameVariants = cva(
  "@container/page relative h-full min-h-0 w-full overflow-y-auto bg-workspace text-ink",
  {
    variants: {
      size: {
        auto: "pt-[34px] pb-[46px] compact:py-[30px] phone:pt-[25px] phone:pb-[85px]",
        desktop: "pt-[34px] pb-[46px]",
        compact: "py-[30px]",
      },
    },
    defaultVariants: {
      size: "auto",
    },
  },
);

export const pageFrameInnerVariants = cva("mx-auto box-content max-w-[930px]", {
  variants: {
    size: {
      auto: "px-[min(36px,6cqi)] compact:px-[min(30px,6cqi)] phone:px-5",
      desktop: "px-[min(36px,6cqi)]",
      compact: "px-[min(30px,6cqi)]",
    },
  },
  defaultVariants: {
    size: "auto",
  },
});

export const pageFrameIntroVariants = cva("flex items-center justify-between gap-5", {
  variants: {
    size: {
      auto: "mb-[34px] phone:mb-[25px] phone:items-start phone:gap-3",
      desktop: "mb-[34px]",
      compact: "mb-[34px]",
    },
  },
  defaultVariants: {
    size: "auto",
  },
});

export const pageFrameTitleVariants = cva("mt-2.5 mb-3 font-serif font-normal tracking-[-0.035em]", {
  variants: {
    size: {
      auto: "text-[40px]/[1.12] compact:my-2.5 compact:text-[32px]/[1.15] phone:my-2.5 phone:text-[32px]/[1.15]",
      desktop: "text-[40px]/[1.12]",
      compact: "my-2.5 text-[32px]/[1.15]",
    },
  },
  defaultVariants: {
    size: "auto",
  },
});

export const pageFrameBackVariants = cva("flex-none", {
  variants: {
    size: {
      auto: "compact:hidden phone:hidden",
      desktop: "",
      compact: "hidden",
    },
  },
  defaultVariants: {
    size: "auto",
  },
});

export type PageFrameSize = NonNullable<VariantProps<typeof pageFrameVariants>["size"]>;

export type PageFrameProps = VariantProps<typeof pageFrameVariants> & {
  id?: string;
  eyebrow: string;
  title: string;
  line: string;
  backLabel?: string;
  onBack?: () => void;
  class?: string;
  children?: ComponentChildren;
};

export default function PageFrame({
  id,
  eyebrow,
  title,
  line,
  backLabel = "Back to story",
  onBack,
  size,
  class: className,
  children,
}: PageFrameProps) {
  return (
    <section id={id} aria-label={title} class={cn(pageFrameVariants({ size }), className)}>
      <div class={pageFrameInnerVariants({ size })}>
        <div class={pageFrameIntroVariants({ size })}>
          <div>
            <div class="text-eyebrow text-accent uppercase">{eyebrow}</div>
            <h1 class={pageFrameTitleVariants({ size })}>{title}</h1>
            <p class="m-0 max-w-[550px] text-body text-muted">{line}</p>
          </div>
          {onBack && (
            <div class={pageFrameBackVariants({ size })}>
              <Button variant="quiet" onClick={onBack}>
                <BackIcon />
                {backLabel}
              </Button>
            </div>
          )}
        </div>
        {children}
      </div>
    </section>
  );
}
