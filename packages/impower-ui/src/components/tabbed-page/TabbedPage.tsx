import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentChildren, JSX } from "preact";
import { useId } from "preact/hooks";
import { cn } from "../../utils/cn";
import Button from "../button/Button";
import { BackIcon } from "../icon/icons.generated";
import Tabs, { Tab, TabPanel } from "../tabs/Tabs";

export const tabbedPageVariants = cva(
  "flex min-h-0 flex-1 flex-col bg-bg [:root[data-layout=desktop]_&]:bg-paper",
);

export const tabbedPageHeaderVariants = cva(
  "flex h-14 flex-none items-center gap-2.5 border-b border-edge bg-workspace px-4 [&>svg]:h-5 [&>svg]:w-[19px] [:root[data-layout=desktop]_&>svg]:size-5 [:root[data-layout=desktop]_&]:h-[68px] [:root[data-layout=desktop]_&]:gap-3 [:root[data-layout=desktop]_&]:px-[22px]",
);

export const tabbedPageTitleVariants = cva(
  "min-w-0 flex-1 text-[14px]/[1.35] font-semibold text-ink [:root[data-layout=desktop]_&]:text-[17px]/[1.3]",
);

export type TabbedPageVariantProps = VariantProps<typeof tabbedPageVariants>;

export type TabbedPageTab = {
  value: string;
  label: string;
  content: ComponentChildren;
};

export type TabbedPageHeaderProps =
  | {
      header?: "present";
      icon?: ComponentChildren;
      backLabel?: string;
      onBack: () => void;
    }
  | {
      header: "absent";
      icon?: never;
      backLabel?: never;
      onBack?: never;
    };

export type TabbedPageProps = TabbedPageVariantProps &
  Omit<JSX.HTMLAttributes<HTMLElement>, "title" | "icon" | "class" | "value" | "children"> &
  TabbedPageHeaderProps & {
  title: string;
  tabs: readonly TabbedPageTab[];
  value: string;
  onValueChange: (value: string) => void;
  showTabs?: boolean;
  class?: string;
  children?: ComponentChildren;
};

export default function TabbedPage({
  header = "present",
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
  const panel = useId();
  const tabbed = showTabs && tabs.length > 1;
  const current = tabbed
    ? (tabs.find((tab) => tab.value === value) ?? tabs[0])
    : tabs[0];
  return (
    <section aria-label={title} class={cn(tabbedPageVariants(), className)} {...rest}>
      {header === "present" && (
        <header class={tabbedPageHeaderVariants()}>
          {icon}
          <h1 class={tabbedPageTitleVariants()}>{title}</h1>
          <Button variant="quiet" size="compact" glyph="md" class="gap-2 px-0.5 text-accent" onClick={onBack}>
            <BackIcon />
            {backLabel}
          </Button>
        </header>
      )}
      {tabbed && (
        <Tabs
          variant="page"
          iconLayout="beside"
          panel={panel}
          value={current?.value ?? null}
          onChange={onValueChange}
          class="mx-[18px] w-auto flex-none border-b border-edge phone:mx-4 compact:mx-4"
        >
          {tabs.map((tab) => (
            <Tab key={tab.value} value={tab.value}>
              {tab.label}
            </Tab>
          ))}
        </Tabs>
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
