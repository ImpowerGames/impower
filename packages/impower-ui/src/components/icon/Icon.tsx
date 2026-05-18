import type { ComponentChildren } from "preact";

export const propDefaults = {
  size: null as string | null,
};

export type IconProps = Partial<typeof propDefaults> & {
  class?: string;
  children?: ComponentChildren;
};

export default function Icon({ size, class: className, children }: IconProps) {
  const sizeValue = size || "1em";
  return (
    <span
      role="img"
      aria-hidden="true"
      class={`inline-flex items-center justify-center [&>svg]:w-full [&>svg]:h-full${
        className ? ` ${className}` : ""
      }`}
      style={{ width: sizeValue, height: sizeValue, fontSize: sizeValue }}
    >
      {children}
    </span>
  );
}
