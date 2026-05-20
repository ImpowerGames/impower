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
  // Active text color depends on indicator style:
  //   - "underline" → text-primary (matches the bar, shadcn pattern)
  //   - "none"      → text-foreground (sparkle's brightness-only shift)
  const activeColorClass =
    ctx.indicator === "underline" ? "text-primary" : "text-foreground";
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
          // Padding (16/20), font (14/600), icon-text gap (2px) match sparkle's
          // s-tab CSS so the bottom-nav in impower-dev renders pixel-identical
          // to main. The horizontal column-gap stays a little wider for tabs
          // that DON'T stack icon-above-text (sparkle: 8px in row mode).
          "group relative flex flex-1 items-center justify-center gap-x-2 gap-y-0.5 px-5 py-4 text-sm font-semibold select-none",
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
        {(icon || activeIcon) && (
          <span class="relative inline-flex size-[21px] items-center justify-center">
            {/* Inactive icon copy — visible by default, fades out on active.
                Color brightens on hover via text-foreground (color transition is OK
                on the main thread; hover doesn't trigger heavy mounts). */}
            {icon ? (
              <span class="absolute inset-0 text-foreground/60 group-hover:text-foreground group-data-[state=active]:opacity-0 transition-opacity duration-100">
                {(() => {
                  const Inactive = icon;
                  return <Inactive class="size-[21px]" />;
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
                  return <Active class="size-[21px]" />;
                })()}
              </span>
            ) : null}
          </span>
        )}
        {/* sparkle's s-tab scaled the label 0.8 → 0.9 on activation. We
            mirror those exact ratios so the bottom-nav label sizes match
            main pixel-for-pixel. Transform runs on the compositor so this
            transition survives a heavy mount, same as the icons. */}
        <span class="relative inline-block leading-none scale-80 group-data-[state=active]:scale-90 transition-transform duration-100">
          {/* Inactive label copy — takes layout space, fades out on active. */}
          <span class="text-foreground/60 group-hover:text-foreground group-data-[state=active]:opacity-0 transition-opacity duration-100">
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
