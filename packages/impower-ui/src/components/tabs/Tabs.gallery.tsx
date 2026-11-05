import { useState } from "preact/hooks";
import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import {
  Bolt,
  BoltFill,
  Photo,
  PhotoFill,
  Share,
  ShareFill,
} from "../icon/icons.generated";
import Tabs, { Tab, type TabsProps } from "./Tabs";

function IconTabs(props: Omit<TabsProps, "value" | "onChange" | "children">) {
  const [value, setValue] = useState("logic");
  return (
    <Tabs value={value} onChange={setValue} {...props}>
      <Tab value="logic" icon={Bolt} activeIcon={BoltFill}>
        Logic
      </Tab>
      <Tab value="assets" icon={Photo} activeIcon={PhotoFill}>
        Assets
      </Tab>
      <Tab value="share" icon={Share} activeIcon={ShareFill} disabled>
        Share (disabled)
      </Tab>
    </Tabs>
  );
}

function LabelTabs(props: Omit<TabsProps, "value" | "onChange" | "children">) {
  const [value, setValue] = useState<string | null>("main");
  return (
    <Tabs value={value} onChange={setValue} {...props}>
      <Tab value="main">Main</Tab>
      <Tab value="scripts">Scripts</Tab>
      <Tab value="locked" disabled>
        Locked (disabled)
      </Tab>
    </Tabs>
  );
}

function NoSelectionTabs() {
  const [value, setValue] = useState<string | null>(null);
  return (
    <Tabs value={value} onChange={setValue}>
      <Tab value="main">Main</Tab>
      <Tab value="scripts">Scripts</Tab>
    </Tabs>
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
