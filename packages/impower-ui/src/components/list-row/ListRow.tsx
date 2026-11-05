import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentChildren, JSX } from "preact";
import { cn } from "../../utils/cn";

export const listRowVariants = cva(
  [
    "group/row relative flex h-full min-w-0 items-center rounded-control",
    "before:pointer-events-none before:absolute before:inset-y-3 before:left-0 before:w-0.5 before:rounded-sm before:bg-accent before:opacity-0",
  ],
  {
    variants: {
      current: {
        true: "bg-tint before:opacity-100",
        false: "",
      },
    },
    defaultVariants: { current: false },
  },
);

export const listRowBodyVariants = cva(
  [
    "relative flex h-full min-w-0 flex-1 items-center rounded-control text-left text-ink",
    "[&>svg]:flex-none [&>svg]:text-muted",
  ],
  {
    variants: {
      size: {
        default:
          "min-h-[60px] gap-[13px] px-3 py-2.5 [&>svg:first-child]:size-[21px] [&>svg:last-child:not(:first-child)]:ml-auto [&>svg:last-child:not(:first-child)]:size-4",
        compact:
          "min-h-11 gap-2.5 px-2 py-1.5 [&>svg:first-child]:size-[18px] [&>svg:last-child:not(:first-child)]:ml-auto [&>svg:last-child:not(:first-child)]:size-4",
      },
      interactive: {
        true: "control-overlay cursor-pointer focus-inset",
        false: "",
      },
    },
    defaultVariants: { size: "default", interactive: true },
  },
);

export type ListRowSize = NonNullable<
  VariantProps<typeof listRowBodyVariants>["size"]
>;

export type ListRowProps = {
  icon?: ComponentChildren;
  label: ComponentChildren;
  description?: ComponentChildren;
  trailing?: ComponentChildren;
  actions?: ComponentChildren;
  current?: boolean;
  size?: ListRowSize;
  class?: string;
  onClick?: (event: MouseEvent) => void;
} & Omit<
  JSX.HTMLAttributes<HTMLButtonElement>,
  "class" | "icon" | "label" | "onClick" | "size"
>;

export default function ListRow({
  icon,
  label,
  description,
  trailing,
  actions,
  current = false,
  size,
  class: className,
  onClick,
  ...rest
}: ListRowProps) {
  const copy = (
    <span class="flex min-w-0 flex-1 flex-col gap-[3px]">
      <span
        class={cn(
          "text-[14px]/[1.5]",
          typeof label === "string" && "[--fade:24px] fade-edge",
        )}
      >
        {label}
      </span>
      {description && (
        <small class="text-[11px]/[1.4] text-muted [--fade:24px] fade-edge">
          {description}
        </small>
      )}
    </span>
  );
  const interactive = !!onClick;
  const body = cn(listRowBodyVariants({ size, interactive }));
  return (
    <div class={cn(listRowVariants({ current }), className)}>
      {interactive ? (
        <button
          type="button"
          class={body}
          aria-current={current ? "true" : undefined}
          onClick={onClick}
          {...rest}
        >
          {icon}
          {copy}
          {trailing}
        </button>
      ) : (
        <div class={body}>
          {icon}
          {copy}
          {trailing}
        </div>
      )}
      {actions}
    </div>
  );
}
