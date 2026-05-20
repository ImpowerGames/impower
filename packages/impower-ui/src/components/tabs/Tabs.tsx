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

// Tab trigger button — base layout. No per-tab indicator rules anymore;
// the underline slides via a single shared <div> rendered by Tabs.
const tabTrigger = cva(
  [
    "group relative flex flex-1 items-center justify-center",
    "gap-x-2 gap-y-0.5 px-5 text-sm font-semibold select-none cursor-pointer pointer-events-auto",
    "disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none",
  ],
  {
    variants: {
      orientation: {
        horizontal: "",
        vertical: "w-full",
      },
      iconLayout: {
        // Icon stacked above the label (bottom-nav style). py-4 matches
        // sparkle's bottom-nav padding (16px top/bottom, 20px left/right);
        // height comes out to 60px with icon=21px + label scaled-down.
        above: "flex-col py-4",
        // Icon to the left of the label (page sub-tab style, e.g. share
        // pane's Game/Screenplay top tabs). Sparkle's s-tab in row mode is
        // height-fixed at panel-nav (48px) via `--_height: 48px` and centers
        // content with flex justify+align — vertical padding is 0. Setting
        // h-12 (48px) and not adding py-* matches main's geometry exactly.
        beside: "flex-row h-12",
      },
    },
    defaultVariants: { orientation: "horizontal", iconLayout: "above" },
  },
);

// Surface knobs that don't live on RadixTabs.Root (indicator style, vertical,
// icon/label layout). Tab uses these via context to render its underline +
// label layout.
type TabsContextValue = {
  indicator: "underline" | "none";
  vertical: boolean;
  iconLayout: "above" | "beside";
  // px size for the icon overlay box. `beside` defaults to 16, `above`
  // defaults to 21 — sparkle's s-tab uses different icon sizes in row vs
  // column mode and we mirror them.
  iconSize: number;
};
const TabsContext = createContext<TabsContextValue>({
  indicator: "underline",
  vertical: false,
  iconLayout: "above",
  iconSize: 21,
});

export type TabsProps = {
  /** Currently active tab `value`. */
  value: string | null;
  /** Fires when the user clicks (or keyboard-activates) a tab. */
  onChange: (value: string) => void;
  /** "underline" shows the active-tab underline; "none" hides it. */
  indicator?: "underline" | "none";
  /** Stack tabs vertically instead of in a row. */
  vertical?: boolean;
  /**
   * Icon position relative to the label inside each Tab.
   * - `above` (default): icon-on-top + label-below (bottom-nav style)
   * - `beside`: icon-on-left + label-right (page sub-tab style)
   */
  iconLayout?: "above" | "beside";
  /** Tailwind classes for the tablist container. */
  class?: string;
  containerRef?: Ref<HTMLDivElement>;
  children: ComponentChildren;
};

/**
 * A horizontal (or vertical) row of `<Tab>` children with an underline
 * indicator under the active one. Controlled — pass `value` + `onChange`.
 *
 * Built on Radix's accessible Tabs primitive: keyboard arrow navigation,
 * roving tabindex, ARIA `role="tab"`/`role="tablist"` are handled for us.
 * We add an `<Tab>` wrapper component for the icon + active-icon swap and
 * the underline indicator visuals.
 */
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
  // Icon size depends on layout — sparkle uses 21px for column (bottom-nav)
  // and 16px for row (sub-tabs). Match them so the port lines up pixel-
  // identical against main.
  const iconSize = iconLayout === "above" ? 21 : 16;
  // Sliding-underline indicator. We measure the active trigger's offset +
  // size on every value change and translate a single shared <div> to it.
  // Sparkle's <s-tabs> did this with the same trick — gives the smooth
  // glide-between-tabs animation that a per-tab ::after pseudo can't.
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
    // Re-measure on container resize (responsive layout, sidebar collapse).
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
                    "pointer-events-none absolute bg-foreground transition-transform duration-150 ease-out",
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
  /** Identifier matched against the parent `<Tabs value>`. */
  value: string;
  /** Icon component shown when this tab is inactive. */
  icon?: IconComponent;
  /** Icon component shown when this tab is active. Falls back to `icon`. */
  activeIcon?: IconComponent;
  disabled?: boolean;
  /** Tailwind classes for the tab button. */
  class?: string;
  children: ComponentChildren;
};

/**
 * A single tab button. Active state, keyboard nav, and ARIA are handled by
 * RadixTabs.Trigger underneath. The visual styling (icon, active-icon swap,
 * underline indicator) is layered on top here.
 */
export function Tab({
  value,
  icon,
  activeIcon,
  disabled,
  class: className,
  children,
}: TabProps) {
  const ctx = useContext(TabsContext);
  // Active icon/label color — always `text-foreground` (near-white). Matches
  // impower.dev's design (active s-tab uses rgb(242, 242, 242) regardless of
  // indicator style). Don't switch to `text-primary` for the underline
  // variant — that's a shadcn convention that doesn't apply here.
  const activeColorClass = "text-foreground";
  return (
    <RadixTabs.Trigger value={value} disabled={disabled} asChild>
      {/* Radix injects data-state="active"|"inactive" on the rendered element.
          We don't drive color on the button itself — instead each icon and
          label has TWO copies (inactive / active) crossfaded via opacity, so
          the transition runs on the compositor thread and survives a
          main-thread stall (e.g. <se-assets> mounting hundreds of rows).
          Using `asChild` lets us render a real <button> while still getting
          Radix's keyboard/ARIA wiring. */}
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
            class="relative inline-flex items-center justify-center"
            style={{ width: `${ctx.iconSize}px`, height: `${ctx.iconSize}px` }}
          >
            {/* Inactive icon copy — visible by default, fades out on active.
                Color brightens on hover via text-foreground (color transition is OK
                on the main thread; hover doesn't trigger heavy mounts). */}
            {icon ? (
              <span class="absolute inset-0 text-engine-500 group-hover:text-foreground group-data-[state=active]:opacity-0 transition-opacity duration-100">
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
            {/* Active icon copy — overlaid, fades in on active. */}
            {(activeIcon ?? icon) ? (
              <span
                class={cn(
                  "absolute inset-0 opacity-0 group-data-[state=active]:opacity-100 transition-opacity duration-100",
                  activeColorClass,
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
        {/* sparkle's s-tab scaled the label 0.8 → 0.9 on activation ONLY in
            column mode (bottom-nav) — row mode (top sub-tabs) renders the
            label at 1.0× always. Mirror that so the bottom-nav label sizes
            match main pixel-for-pixel without shrinking top-tab labels.
            Transform runs on the compositor so this transition survives a
            heavy mount, same as the icons. */}
        <span
          class={cn(
            "relative inline-block leading-none transition-transform duration-100",
            ctx.iconLayout === "above" &&
              "scale-80 group-data-[state=active]:scale-90",
          )}
        >
          {/* Inactive label copy — takes layout space, fades out on active. */}
          <span class="text-engine-500 group-hover:text-foreground group-data-[state=active]:opacity-0 transition-opacity duration-100">
            {children}
          </span>
          {/* Active label copy — overlaid, fades in on active. Using opacity
              (compositor) instead of color (paint) means the crossfade
              continues smoothly even while the main thread is busy mounting
              the new pane's DOM. */}
          <span
            class={cn(
              "absolute inset-0 opacity-0 group-data-[state=active]:opacity-100 transition-opacity duration-100",
              activeColorClass,
            )}
          >
            {children}
          </span>
        </span>
      </button>
    </RadixTabs.Trigger>
  );
}
