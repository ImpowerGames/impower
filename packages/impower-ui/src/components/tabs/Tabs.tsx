import * as RadixTabs from "@radix-ui/react-tabs";
import { type ComponentChildren, type Ref } from "preact";
import { useContext } from "preact/hooks";
import { createContext } from "preact";
import type { IconComponent } from "../icon/icons.generated";
import { cn } from "../../utils/cn";

// Surface knobs that don't live on RadixTabs.Root (indicator style, vertical).
// Tab uses these via context to render its underline + label layout.
type TabsContextValue = {
  indicator: "underline" | "none";
  vertical: boolean;
};
const TabsContext = createContext<TabsContextValue>({
  indicator: "underline",
  vertical: false,
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
  class: className,
  containerRef,
  children,
}: TabsProps) {
  return (
    <TabsContext.Provider value={{ indicator, vertical }}>
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
            "relative flex w-full",
            vertical ? "flex-col" : "flex-row items-stretch",
            className,
          )}
        >
          <RadixTabs.List asChild>
            <div
              class={cn(
                "flex w-full",
                vertical ? "flex-col" : "flex-row items-stretch",
              )}
            >
              {children}
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
  return (
    <RadixTabs.Trigger value={value} disabled={disabled} asChild>
      {/* Radix injects data-state="active"|"inactive" on the rendered element,
          which we use to drive the underline indicator and the icon swap.
          Using `asChild` lets us render a real <button> with our classes
          while still getting Radix's keyboard/ARIA wiring. */}
      <button
        type="button"
        class={cn(
          "group relative flex flex-1 items-center justify-center gap-2 px-3 py-2 text-sm font-medium select-none",
          "text-muted-foreground hover:text-foreground transition-colors",
          "data-[state=active]:text-primary",
          "disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none",
          ctx.vertical && "w-full",
          ctx.indicator === "underline" &&
            !ctx.vertical &&
            "data-[state=active]:after:absolute data-[state=active]:after:bottom-0 data-[state=active]:after:left-0 data-[state=active]:after:right-0 data-[state=active]:after:h-0.5 data-[state=active]:after:bg-primary",
          ctx.indicator === "underline" &&
            ctx.vertical &&
            "data-[state=active]:after:absolute data-[state=active]:after:right-0 data-[state=active]:after:top-0 data-[state=active]:after:bottom-0 data-[state=active]:after:w-0.5 data-[state=active]:after:bg-primary",
          className,
        )}
      >
        {/* Render BOTH icons and toggle visibility via data-state, so the
            active-icon swap doesn't briefly flash an empty slot. */}
        {(icon || activeIcon) && (
          <span class="relative inline-flex size-4 items-center justify-center">
            {icon ? (
              <span class="absolute inset-0 group-data-[state=active]:opacity-0 transition-opacity">
                {(() => {
                  const Inactive = icon;
                  return <Inactive class="size-4" />;
                })()}
              </span>
            ) : null}
            {(activeIcon ?? icon) ? (
              <span class="absolute inset-0 opacity-0 group-data-[state=active]:opacity-100 transition-opacity">
                {(() => {
                  const Active = activeIcon ?? icon!;
                  return <Active class="size-4" />;
                })()}
              </span>
            ) : null}
          </span>
        )}
        <span>{children}</span>
      </button>
    </RadixTabs.Trigger>
  );
}
