import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../utils/cn";

export const themeSwatchVariants = cva(
  "relative grid shrink-0 grid-cols-[18%_1fr_27%] overflow-hidden rounded-[5px] border border-solid border-edge",
  {
    variants: {
      size: {
        default: [
          "h-[60px] gap-[7px] p-2",
          "phone:h-[55px] phone:w-20 phone:gap-1 phone:p-1.5",
        ],
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

export type ThemeSwatchSize = NonNullable<VariantProps<typeof themeSwatchVariants>["size"]>;

export type ThemeSwatchProps = VariantProps<typeof themeSwatchVariants> & {
  theme: string;
  pairedTheme?: string;
  class?: string;
};

export default function ThemeSwatch({ theme, pairedTheme, size, class: className }: ThemeSwatchProps) {
  return (
    <span
      data-theme={theme}
      data-theme-swatch
      aria-hidden="true"
      class={cn(themeSwatchVariants({ size }), className)}
    >
      <span class="absolute inset-0 flex">
        <span class="flex-1 bg-bg" />
        {pairedTheme && <span data-theme={pairedTheme} class="flex-1 bg-bg" />}
      </span>
      <i class="relative rounded-[2px] bg-elevated" />
      <span class="relative flex flex-col gap-[7px] pt-1 phone:gap-1">
        <b class="h-[3px] w-[48%] rounded-[2px] bg-accent" />
        <b class="h-[3px] w-[85%] rounded-[2px] bg-muted" />
        <b class="h-[3px] w-[60%] rounded-[2px] bg-muted" />
        <b class="h-[3px] w-[85%] rounded-[2px] bg-muted" />
      </span>
      <em data-theme={pairedTheme ?? theme} class="relative rounded-[2px] border border-solid border-edge bg-bg" />
    </span>
  );
}
