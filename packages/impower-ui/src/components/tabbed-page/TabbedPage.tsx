import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentChildren, JSX } from "preact";
import { cn } from "../../utils/cn";
import Button from "../button/Button";
import { BackIcon } from "../icon/icons.generated";
import Tabs, { Tab } from "../tabs/Tabs";

export const tabbedPageVariants = cva(
  "flex min-h-0 flex-1 flex-col bg-bg [:root[data-layout=desktop]_&]:bg-paper",
);

export const tabbedPageHeaderVariants = cva(
  "flex h-12 flex-none items-center gap-2.5 border-b border-edge px-4 [:root[data-layout=desktop]_&]:h-[68px] [:root[data-layout=desktop]_&]:px-[18px]",
);

export const tabbedPageTitleVariants = cva(
  "min-w-0 flex-1 text-[14px] font-semibold [:root[data-layout=desktop]_&]:text-[17px]",
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
  icon?: ComponentChildren;
  backLabel?: string;
  onBack: () => void;
  tabs: readonly TabbedPageTab[];
  value: string;
  onValueChange: (value: string) => void;
  showTabs?: boolean;
  class?: string;
  children?: ComponentChildren;
};

export default function TabbedPage({
  title,
  icon,
  backLabel = "Back to story",
  onBack,
  tabs,
  value,
  onValueChange,
  showTabs = true,
  class: className,
  children,
  ...rest
}: TabbedPageProps) {
  const tabbed = showTabs && tabs.length > 1;
  const current = tabbed
    ? (tabs.find((tab) => tab.value === value) ?? tabs[0])
    : tabs[0];
  return (
    <section aria-label={title} class={cn(tabbedPageVariants(), className)} {...rest}>
      <header class={tabbedPageHeaderVariants()}>
        {icon}
        <h1 class={tabbedPageTitleVariants()}>{title}</h1>
        <Button variant="quiet" size="compact" class="text-accent" onClick={onBack}>
          <BackIcon />
          {backLabel}
        </Button>
      </header>
      {tabbed && (
        <Tabs
          variant="page"
          iconLayout="beside"
          value={current?.value ?? null}
          onChange={onValueChange}
          class="flex-none border-b border-edge"
        >
          {tabs.map((tab) => (
            <Tab key={tab.value} value={tab.value}>
              {tab.label}
            </Tab>
          ))}
        </Tabs>
      )}
      {current && (
        <div
          key={current.value}
          role={tabbed ? "tabpanel" : undefined}
          aria-label={tabbed ? current.label : undefined}
          class="flex min-h-0 flex-1 flex-col"
        >
          {current.content}
        </div>
      )}
      {children}
    </section>
  );
}
