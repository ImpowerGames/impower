import * as RadixTabs from "@radix-ui/react-tabs";
import { cva } from "class-variance-authority";
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
  },
  defaultVariants: { orientation: "horizontal" },
});

const tabsList = cva("flex w-full", {
  variants: {
    orientation: {
      horizontal: "flex-row items-stretch",
      vertical: "flex-col",
    },
  },
  defaultVariants: { orientation: "horizontal" },
});

const tabTrigger = cva(
  [
    "group relative flex flex-1 items-center justify-center overflow-hidden",
    "gap-x-2 gap-y-0.5 px-5 text-sm font-semibold select-none cursor-pointer pointer-events-auto",
    "disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none",
    "hover:bg-foreground/5 active:bg-foreground/[0.12]",
  ],
  {
    variants: {
      orientation: {
        horizontal: "",
        vertical: "w-full",
      },
      iconLayout: {
        above: "flex-col py-4",
        beside: "flex-row h-12",
      },
    },
    defaultVariants: { orientation: "horizontal", iconLayout: "above" },
  },
);

type TabsContextValue = {
  indicator: "underline" | "none";
  vertical: boolean;
  iconLayout: "above" | "beside";
  iconSize: number;
};
const TabsContext = createContext<TabsContextValue>({
  indicator: "underline",
  vertical: false,
  iconLayout: "above",
  iconSize: 21,
});

export type TabsProps = {
  value: string | null;
  onChange: (value: string) => void;
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
  indicator = "underline",
  vertical = false,
  iconLayout = "above",
  class: className,
  containerRef,
  children,
}: TabsProps) {
  const iconSize = iconLayout === "above" ? 21 : 16;
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
      setIndicatorRect({
        x: ar.left - lr.left,
        y: ar.top - lr.top,
        w: ar.width,
        h: ar.height,
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(list);
    return () => ro.disconnect();
  }, [value, indicator, vertical]);

  return (
    <TabsContext.Provider
      value={{ indicator, vertical, iconLayout, iconSize }}
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
            tabsContainer({ orientation: vertical ? "vertical" : "horizontal" }),
            className,
          )}
        >
          <RadixTabs.List asChild>
            <div
              ref={listRef}
              class={cn(
                tabsList({
                  orientation: vertical ? "vertical" : "horizontal",
                }),
                "relative",
              )}
            >
              {children}
              {indicator === "underline" && indicatorRect && (
                <div
                  aria-hidden="true"
                  class={cn(
                    "pointer-events-none absolute bg-tab-foreground transition-transform duration-150",
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
  const activeColorClass = "text-tab-foreground";
  const inactiveColor = color || "text-engine-500";
  const activeColor = color || activeColorClass;
  return (
    <RadixTabs.Trigger value={value} disabled={disabled} asChild>
      {
}
      <button
        type="button"
        class={cn(
          tabTrigger({
            orientation: ctx.vertical ? "vertical" : "horizontal",
            iconLayout: ctx.iconLayout,
          }),
          className,
        )}
      >
        {(icon || activeIcon) && (
          <span
            class="relative inline-flex flex-col items-center justify-center"
            style={{ width: `${ctx.iconSize}px`, height: `${ctx.iconSize}px` }}
          >
            {
}
            {icon ? (
              <span
                class={cn(
                  "absolute inset-0 group-data-[state=active]:opacity-0 transition-opacity duration-100",
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
            {}
            {(activeIcon ?? icon) ? (
              <span
                class={cn(
                  "absolute inset-0 opacity-0 group-data-[state=active]:opacity-100 transition-opacity duration-100",
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
        {
}
        <span
          class={cn(
            "relative inline-block leading-none transition-transform duration-100",
            ctx.iconLayout === "above" &&
              "scale-80 group-data-[state=active]:scale-90",
          )}
        >
          {}
          <span
            class={cn(
              "group-data-[state=active]:opacity-0 transition-opacity duration-100",
              inactiveColor,
            )}
          >
            {children}
          </span>
          {
}
          <span
            class={cn(
              "absolute inset-0 opacity-0 group-data-[state=active]:opacity-100 transition-opacity duration-100",
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
