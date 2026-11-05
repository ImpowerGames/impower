import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../utils/cn";

export const railIndexRowVariants = cva(
  "relative flex min-h-11 min-w-0 items-center rounded-control border-l-2 border-solid border-transparent",
  {
    variants: {
      depth: {
        top: "data-[current]:before:pointer-events-none data-[current]:before:absolute data-[current]:before:top-2 data-[current]:before:bottom-2 data-[current]:before:left-0.5 data-[current]:before:z-[1] data-[current]:before:w-0.5 data-[current]:before:rounded-[1px] data-[current]:before:bg-accent data-[current]:before:content-['']",
        nested: "-ml-px min-h-10 rounded-l-none data-[current]:border-l-accent",
      },
    },
    defaultVariants: {
      depth: "top",
    },
  },
);

export const railIndexJumpVariants = cva(
  [
    "relative control-overlay flex h-11 min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-control",
    "border-0 bg-transparent py-2 pr-2 pl-1.5 text-left text-[13px] text-ink",
    "in-data-[current]:text-accent in-data-[contains-current]:text-accent",
  ],
  {
    variants: {
      depth: {
        top: "font-semibold",
        nested: "h-10 min-h-10 rounded-l-none pl-0.5",
      },
    },
    defaultVariants: {
      depth: "top",
    },
  },
);

export type RailIndexDepth = NonNullable<VariantProps<typeof railIndexRowVariants>["depth"]>;

export type RailIndexItem = {
  readonly id: string;
  readonly label: string;
};

export type RailIndexGroup = RailIndexItem & {
  readonly items: readonly RailIndexItem[];
};

export type RailIndexProps = {
  title: string;
  label: string;
  groups: readonly RailIndexGroup[];
  current?: string;
  onJump: (id: string) => void;
  class?: string;
};

function Row({
  item,
  depth,
  current,
  containsCurrent,
  onJump,
}: {
  item: RailIndexItem;
  depth: RailIndexDepth;
  current: boolean;
  containsCurrent?: boolean;
  onJump: (id: string) => void;
}) {
  return (
    <div
      class={cn(railIndexRowVariants({ depth }), current && "bg-tint")}
      data-current={current ? "" : undefined}
      data-contains-current={containsCurrent ? "" : undefined}
    >
      <button
        type="button"
        class={railIndexJumpVariants({ depth })}
        data-index-jump={item.id}
        aria-current={current ? "true" : undefined}
        onClick={() => onJump(item.id)}
      >
        <span class="fade-edge min-w-0 flex-1 [--fade:24px]">{item.label}</span>
      </button>
    </div>
  );
}

export default function RailIndex({ title, label, groups, current, onJump, class: className }: RailIndexProps) {
  return (
    <div class={cn("flex min-h-0 flex-1 flex-col overflow-hidden", className)}>
      <div class="flex h-11 flex-none items-center pr-[14px] pl-9">
        <h2 class="m-0 text-[14px]/[1.4] font-semibold text-ink">{title}</h2>
      </div>
      <nav
        aria-label={label}
        class="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain pt-0.5 pr-[14px] pl-[26px]"
      >
        <ul class="m-0 grid min-w-0 list-none grid-cols-[minmax(0,1fr)] gap-0.5 p-0 [&>li+li]:mt-1.5">
          {groups.map((group) => {
            const containsCurrent = group.items.some((item) => item.id === current);
            return (
              <li key={group.id}>
                <Row
                  item={group}
                  depth="top"
                  current={group.id === current}
                  containsCurrent={containsCurrent}
                  onJump={onJump}
                />
                {group.items.length > 0 && (
                  <ul
                    aria-label={group.label}
                    class="m-0 mt-0.5 mb-1.5 ml-3.5 grid min-w-0 list-none grid-cols-[minmax(0,1fr)] gap-0.5 border-l border-solid border-edge p-0"
                  >
                    {group.items.map((item) => (
                      <li key={item.id}>
                        <Row item={item} depth="nested" current={item.id === current} onJump={onJump} />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
