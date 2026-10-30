import { Button } from "@impower/impower-ui/components";
import type { ButtonProps } from "@impower/impower-ui/components";
import type { ComponentChildren } from "preact";

const sizeClasses = {
  default: "h-14 px-8 text-base",
  sm: "h-12 px-6 text-sm",
} as const;

export type OptionButtonSize = keyof typeof sizeClasses;

export type OptionButtonProps = Omit<
  ButtonProps,
  "size" | "type" | "variant" | "asChild"
> & {
  size?: OptionButtonSize;
  class?: string;
  children?: ComponentChildren;
};

export default function OptionButton({
  size = "default",
  class: className = "",
  children,
  ...rest
}: OptionButtonProps) {
  return (
    <Button
      variant="ghost"
      class={`w-full justify-between rounded-none font-normal text-foreground/80 ${sizeClasses[size]} ${className}`}
      {...rest}
    >
      {children}
    </Button>
  );
}
