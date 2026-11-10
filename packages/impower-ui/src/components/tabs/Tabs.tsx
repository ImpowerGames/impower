import * as RadixTabs from "@radix-ui/react-tabs";
import { cva, type VariantProps } from "class-variance-authority";
import { type ComponentChildren, type Ref } from "preact";
import { useContext, useLayoutEffect, useRef, useState } from "preact/hooks";
import { createContext } from "preact";
import type { IconComponent } from "../icon/icons.generated";
import { cn } from "../../utils/cn";

const tabsContainer = cva("relative flex w-full", {
  variants: {
    orientation: {
      horizontal: "flex-row items-stretch",
      vertical: "flex-col",
    },
    variant: {
      default: "",
      rail: "@container",
      bar: "",
      page: "",
      inline: "min-h-[52px] items-center",
    },
  },
  defaultVariants: { orientation: "horizontal", variant: "default" },
});

const tabsList = cva("flex w-full", {
  variants: {
    orientation: {
      horizontal: "flex-row items-stretch",
      vertical: "flex-col",
    },
    variant: {
      default: "",
      rail: "",
      bar: "items-center justify-evenly",
      page: "",
      inline: "min-w-0 gap-[18px] phone:gap-2",
    },
    scroll: {
      true: [
        "overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        "pr-5 [mask-image:linear-gradient(to_right,#000_calc(100%_-_20px),transparent)]",
      ],
      false: "",
    },
  },
  defaultVariants: { orientation: "horizontal", variant: "default", scroll: false },
});

const tabTrigger = cva(
  [
    "group relative control-overlay flex flex-1 items-center justify-center overflow-hidden rounded-t-control",
    "gap-x-2 gap-y-0.5 px-5 text-sm font-semibold select-none cursor-pointer",
    "disabled:opacity-40 disabled:cursor-default disabled:pointer-events-none",
  ],
  {
    variants: {
      orientation: {
        horizontal: "",
        vertical: "w-full rounded-control",
      },
      iconLayout: {
        above: "flex-col min-h-11 py-4",
        beside: "flex-row min-h-12",
      },
      variant: {
        default: "",
        rail: [
          "flex-none justify-start gap-3 min-h-[46px] px-[13px] py-2.5 rounded-control text-sm font-normal",
          "data-[state=active]:bg-tint data-[state=active]:font-semibold",
          "@max-[140px]:flex-col @max-[140px]:justify-center @max-[140px]:gap-1 @max-[140px]:min-h-[66px] @max-[140px]:px-0 @max-[140px]:text-[11px]/[1.35]",
        ],
        bar: "flex-none flex-col gap-1 size-16 min-h-16 p-0 rounded-control text-[10px]/none font-normal",
        page: "min-h-12 rounded-none px-4 text-[14px] font-semibold",
        inline: "flex-none min-h-[50px] min-w-11 px-1 text-[13px] font-normal phone:px-px",
      },
    },
    defaultVariants: {
      orientation: "horizontal",
      iconLayout: "above",
      variant: "default",
    },
  },
);

export type TabsVariant = NonNullable<
  VariantProps<typeof tabTrigger>["variant"]
>;

type TabsContextValue = {
  variant: TabsVariant;
  indicator: "underline" | "none";
  vertical: boolean;
  iconLayout: "above" | "beside";
  iconSize: number;
};
const TabsContext = createContext<TabsContextValue>({
  variant: "default",
  indicator: "underline",
  vertical: false,
  iconLayout: "above",
  iconSize: 21,
});

export type TabsProps = {
  value: string | null;
  onChange: (value: string) => void;
  variant?: TabsVariant;
  scroll?: boolean;
  indicator?: "underline" | "none";
  vertical?: boolean;
  iconLayout?: "above" | "beside";
  class?: string;
  containerRef?: Ref<HTMLDivElement>;
  children: ComponentChildren;
};

export default function Tabs({
  value,
  onChange,
  variant = "default",
  scroll = false,
  indicator = "underline",
  vertical = false,
  iconLayout = "above",
  class: className,
  containerRef,
  children,
}: TabsProps) {
  const iconSize =
    variant === "rail"
      ? 18
      : variant === "bar"
        ? 19
        : iconLayout === "above"
          ? 21
          : 16;
  const listRef = useRef<HTMLDivElement | null>(null);
  const [indicatorRect, setIndicatorRect] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (indicator !== "underline") return;
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      const active = list.querySelector<HTMLElement>('[data-state="active"]');
      if (!active) {
        setIndicatorRect(null);
        return;
      }
      const lr = list.getBoundingClientRect();
      const ar = active.getBoundingClientRect();
      const style = getComputedStyle(active);
      const inset =
        variant === "inline"
          ? { left: parseFloat(style.paddingLeft) || 0, right: parseFloat(style.paddingRight) || 0 }
          : { left: 0, right: 0 };
      setIndicatorRect({
        x: ar.left - lr.left + list.scrollLeft + inset.left,
        y: ar.top - lr.top + list.scrollTop,
        w: ar.width - inset.left - inset.right,
        h: ar.height,
      });
    };
    const reveal = () => {
      const active = list.querySelector<HTMLElement>('[data-state="active"]');
      if (!active) return;
      const left = active.getBoundingClientRect().left - list.getBoundingClientRect().left + list.scrollLeft;
      const right = left + active.offsetWidth + (parseFloat(getComputedStyle(list).paddingRight) || 0);
      if (left < list.scrollLeft) {
        list.scrollLeft = left;
      } else if (right > list.scrollLeft + list.clientWidth) {
        list.scrollLeft = right - list.clientWidth;
      }
    };
    if (scroll) reveal();
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(list);
    return () => ro.disconnect();
  }, [value, indicator, vertical, variant, scroll]);

  return (
    <TabsContext.Provider
      value={{ variant, indicator, vertical, iconLayout, iconSize }}
    >
      <RadixTabs.Root
        value={value ?? undefined}
        onValueChange={onChange}
        orientation={vertical ? "vertical" : "horizontal"}
        activationMode="manual"
        asChild
      >
        <div
          ref={containerRef}
          class={cn(
            tabsContainer({
              orientation: vertical ? "vertical" : "horizontal",
              variant,
            }),
            className,
          )}
        >
          <RadixTabs.List asChild>
            <div
              ref={listRef}
              class={cn(
                tabsList({
                  orientation: vertical ? "vertical" : "horizontal",
                  variant,
                  scroll,
                }),
                "relative",
              )}
            >
              {children}
              {indicator === "underline" && indicatorRect && (
                <div
                  aria-hidden="true"
                  class={cn(
                    "pointer-events-none absolute motion-safe:transition-transform motion-safe:duration-150",
                    variant === "page" || variant === "inline" ? "bg-accent" : "bg-tab-ink",
                    vertical
                      ? "left-auto right-0 w-0.5"
                      : "top-auto bottom-0 h-0.5",
                  )}
                  style={
                    vertical
                      ? {
                          transform: `translateY(${indicatorRect.y}px)`,
                          height: `${indicatorRect.h}px`,
                        }
                      : {
                          transform: `translateX(${indicatorRect.x}px)`,
                          width: `${indicatorRect.w}px`,
                        }
                  }
                />
              )}
            </div>
          </RadixTabs.List>
        </div>
      </RadixTabs.Root>
    </TabsContext.Provider>
  );
}

export type TabProps = {
  value: string;
  icon?: IconComponent;
  activeIcon?: IconComponent;
  disabled?: boolean;
  class?: string;
  color?: string;
  children: ComponentChildren;
};

export function Tab({
  value,
  icon,
  activeIcon,
  disabled,
  class: className,
  color,
  children,
}: TabProps) {
  const ctx = useContext(TabsContext);
  const accented = ctx.variant !== "default";
  const activeColorClass = accented ? "text-accent" : "text-tab-ink";
  const inactiveColor = color || (accented ? "text-muted" : "text-tab-muted");
  const activeColor = color || activeColorClass;
  return (
    <RadixTabs.Trigger value={value} disabled={disabled} asChild>
      <button
        type="button"
        class={cn(
          tabTrigger({
            orientation: ctx.vertical ? "vertical" : "horizontal",
            iconLayout: ctx.iconLayout,
            variant: ctx.variant,
          }),
          className,
        )}
      >
        {(icon || activeIcon) && (
          <span
            class="relative inline-flex shrink-0 flex-col items-center justify-center"
            style={{ width: `${ctx.iconSize}px`, height: `${ctx.iconSize}px` }}
          >
            {icon ? (
              <span
                class={cn(
                  "absolute inset-0 group-data-[state=active]:opacity-0 motion-safe:transition-opacity motion-safe:duration-100",
                  inactiveColor,
                )}
              >
                {(() => {
                  const Inactive = icon;
                  return (
                    <Inactive
                      style={{
                        width: `${ctx.iconSize}px`,
                        height: `${ctx.iconSize}px`,
                      }}
                    />
                  );
                })()}
              </span>
            ) : null}
            {(activeIcon ?? icon) ? (
              <span
                class={cn(
                  "absolute inset-0 opacity-0 group-data-[state=active]:opacity-100 motion-safe:transition-opacity motion-safe:duration-100",
                  activeColor,
                )}
              >
                {(() => {
                  const Active = activeIcon ?? icon!;
                  return (
                    <Active
                      style={{
                        width: `${ctx.iconSize}px`,
                        height: `${ctx.iconSize}px`,
                      }}
                    />
                  );
                })()}
              </span>
            ) : null}
          </span>
        )}
        <span
          class={cn(
            "relative inline-block leading-none motion-safe:transition-transform motion-safe:duration-100",
            ctx.iconLayout === "above" &&
              ctx.variant === "default" &&
              "scale-80 group-data-[state=active]:scale-90",
          )}
        >
          <span
            class={cn(
              "group-data-[state=active]:opacity-0 motion-safe:transition-opacity motion-safe:duration-100",
              inactiveColor,
            )}
          >
            {children}
          </span>
          <span
            class={cn(
              "absolute inset-0 opacity-0 group-data-[state=active]:opacity-100 motion-safe:transition-opacity motion-safe:duration-100",
              activeColor,
            )}
          >
            {children}
          </span>
        </span>
      </button>
    </RadixTabs.Trigger>
  );
}
