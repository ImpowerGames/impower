import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentChildren, JSX } from "preact";
import { useId } from "preact/hooks";
import { cn } from "../../utils/cn";
import Tabs, { Tab, TabPanel } from "../tabs/Tabs";

export const tabbedPageVariants = cva(
  "flex min-h-0 flex-1 flex-col bg-bg [:root[data-layout=desktop]_&]:bg-paper",
);

export type TabbedPageVariantProps = VariantProps<typeof tabbedPageVariants>;

export type TabbedPageTab = {
  value: string;
  label: string;
  content: ComponentChildren;
};

export type TabbedPageProps = TabbedPageVariantProps &
  Omit<JSX.HTMLAttributes<HTMLElement>, "title" | "icon" | "class" | "value" | "children"> & {
  title: string;
  tabs: readonly TabbedPageTab[];
  value: string;
  onValueChange: (value: string) => void;
  showTabs?: boolean;
  tabAction?: ComponentChildren;
  class?: string;
  children?: ComponentChildren;
};

export default function TabbedPage({
  title,
  tabs,
  value,
  onValueChange,
  showTabs = true,
  tabAction,
  class: className,
  children,
  ...rest
}: TabbedPageProps) {
  const panel = useId();
  const tabbed = showTabs && tabs.length > 1;
  const current = tabbed
    ? (tabs.find((tab) => tab.value === value) ?? tabs[0])
    : tabs[0];
  return (
    <section aria-label={title} class={cn(tabbedPageVariants(), className)} {...rest}>
      {tabbed && (
        <div class="mx-[18px] flex flex-none items-center border-b border-edge phone:mx-4 compact:mx-4">
          <Tabs
            variant="page"
            iconLayout="beside"
            panel={panel}
            value={current?.value ?? null}
            onChange={onValueChange}
            class="min-w-0 flex-1"
          >
            {tabs.map((tab) => (
              <Tab key={tab.value} value={tab.value}>
                {tab.label}
              </Tab>
            ))}
          </Tabs>
          {tabAction}
        </div>
      )}
      {current && (
        <TabPanel
          key={current.value}
          panel={panel}
          value={tabbed ? current.value : null}
          class="flex min-h-0 flex-1 flex-col"
        >
          {current.content}
        </TabPanel>
      )}
      {children}
    </section>
  );
}
