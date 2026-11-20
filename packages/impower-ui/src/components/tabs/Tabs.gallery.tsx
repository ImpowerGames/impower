import { useId, useState } from "preact/hooks";
import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import {
  ArtIcon,
  BookIcon,
  ShareIcon,
} from "../icon/icons.generated";
import Tabs, { Tab, TabPanel, type TabsProps } from "./Tabs";

function DemoPanel({ panel, value }: { panel: string; value: string | null }) {
  return (
    <TabPanel panel={panel} value={value} class="px-3 py-2 text-xs text-muted">
      {value ?? "No tab selected"}
    </TabPanel>
  );
}

function IconTabs(props: Omit<TabsProps, "panel" | "value" | "onChange" | "children">) {
  const [value, setValue] = useState("logic");
  const panel = useId();
  return (
    <>
      <Tabs panel={panel} value={value} onChange={setValue} {...props}>
        <Tab value="logic" icon={BookIcon} activeIcon={BookIcon}>
          Logic
        </Tab>
        <Tab value="assets" icon={ArtIcon} activeIcon={ArtIcon}>
          Assets
        </Tab>
        <Tab value="share" icon={ShareIcon} activeIcon={ShareIcon} disabled>
          Share (disabled)
        </Tab>
      </Tabs>
      <DemoPanel panel={panel} value={value} />
    </>
  );
}

function LabelTabs(props: Omit<TabsProps, "panel" | "value" | "onChange" | "children">) {
  const [value, setValue] = useState<string | null>("main");
  const panel = useId();
  return (
    <>
      <Tabs panel={panel} value={value} onChange={setValue} {...props}>
        <Tab value="main">Main</Tab>
        <Tab value="scripts">Scripts</Tab>
        <Tab value="locked" disabled>
          Locked (disabled)
        </Tab>
      </Tabs>
      <DemoPanel panel={panel} value={value} />
    </>
  );
}

function NoSelectionTabs() {
  const [value, setValue] = useState<string | null>(null);
  const panel = useId();
  return (
    <>
      <Tabs panel={panel} value={value} onChange={setValue}>
        <Tab value="main">Main</Tab>
        <Tab value="scripts">Scripts</Tab>
      </Tabs>
      <DemoPanel panel={panel} value={value} />
    </>
  );
}

const TYPE_TABS = ["Images", "Audio", "Video", "Text", "Fonts", "Other"];

function TypeTabs(props: Omit<TabsProps, "panel" | "value" | "onChange" | "children">) {
  const [value, setValue] = useState<string | null>("Audio");
  const panel = useId();
  return (
    <>
      <Tabs panel={panel} value={value} onChange={setValue} variant="inline" iconLayout="beside" {...props}>
        {TYPE_TABS.map((label) => (
          <Tab key={label} value={label}>
            {label}
          </Tab>
        ))}
      </Tabs>
      <DemoPanel panel={panel} value={value} />
    </>
  );
}

const frame = "w-full max-w-[480px] rounded border border-surface-border bg-surface";

function TabsDemo() {
  return (
    <div class="space-y-6">
      <GalleryRow label="Horizontal, underline indicator, labels only, one disabled tab">
        <div class={frame}>
          <LabelTabs />
        </div>
      </GalleryRow>
      <GalleryRow label="No tab selected (value null)">
        <div class={frame}>
          <NoSelectionTabs />
        </div>
      </GalleryRow>
      <GalleryRow label="Icons above labels with active-icon swap, no indicator">
        <div class={frame}>
          <IconTabs indicator="none" class="py-2" />
        </div>
      </GalleryRow>
      <GalleryRow label="Icons above labels, underline indicator">
        <div class={frame}>
          <IconTabs />
        </div>
      </GalleryRow>
      <GalleryRow label="Icons beside labels, underline indicator">
        <div class={frame}>
          <IconTabs iconLayout="beside" />
        </div>
      </GalleryRow>
      <GalleryRow label="Vertical, underline indicator, icons beside labels">
        <div class="w-56 rounded border border-surface-border bg-surface">
          <IconTabs vertical iconLayout="beside" />
        </div>
      </GalleryRow>
      <GalleryRow label="Rail variant, vertical, 20px icons 11px beside their labels: the accent marks the current tab on a tinted row">
        <div class="w-[203px] rounded border border-surface-border bg-bg p-2">
          <IconTabs vertical variant="rail" indicator="none" />
        </div>
      </GalleryRow>
      <GalleryRow label="Rail variant in a 76px rail: below a 140px container the 20px icon stacks 6px over an 11px label on a 1.35 line">
        <div class="w-[76px] rounded border border-surface-border bg-bg p-1.5">
          <IconTabs vertical variant="rail" indicator="none" />
        </div>
      </GalleryRow>
      <GalleryRow label="Bar variant, the phone's bottom navigation: three 64px targets, a 19px icon 4px over a word on a 1.4 line, the accent on the current tab">
        <div class="w-[360px] rounded border border-surface-border bg-panel">
          <IconTabs variant="bar" indicator="none" />
        </div>
      </GalleryRow>
      <GalleryRow label="Page variant, the Scripts page's tab row: each tab as wide as its label with 4px padding and 13px type, 48px rows 20px apart at desktop and 46px rows 22px apart below it, the current tab in the accent over a 2px accent underline as wide as its label, set 1px below the row over its divider">
        <div class="w-[360px] rounded border border-surface-border bg-bg">
          <LabelTabs variant="page" iconLayout="beside" />
        </div>
      </GalleryRow>
      <GalleryRow label="Inline variant, the Assets page's type tabs: each tab as wide as its label, 50px rows, 13px type, the current tab in the accent over a 2px underline as wide as its label, set 1px below the row over its divider">
        <div class="w-[480px] rounded border border-surface-border bg-bg px-4">
          <TypeTabs />
        </div>
      </GalleryRow>
      <GalleryRow label="Inline variant with scroll, in a 240px frame: the row scrolls sideways without a scrollbar and fades out at its right edge">
        <div class="w-[240px] rounded border border-surface-border bg-bg px-4">
          <TypeTabs scroll />
        </div>
      </GalleryRow>
      <GalleryRow label="Vertical, labels only">
        <div class="w-56 rounded border border-surface-border bg-surface">
          <LabelTabs vertical />
        </div>
      </GalleryRow>
    </div>
  );
}

export const tabsGallery: GalleryEntry = {
  title: "Tabs",
  exports: ["Tabs", "Tab"],
  Demo: TabsDemo,
};
