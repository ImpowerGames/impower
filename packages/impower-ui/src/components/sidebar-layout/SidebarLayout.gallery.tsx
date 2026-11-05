import { useState } from "preact/hooks";
import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import SidebarLayout from "./SidebarLayout";

function SidebarExample({ initial }: { initial?: number }) {
  const [width, setWidth] = useState<number | undefined>(initial);
  return (
    <div class="h-72 w-full max-w-[900px] overflow-hidden rounded border border-surface-border bg-bg">
      <SidebarLayout
        width={width}
        defaultWidth={232}
        minWidth={180}
        maxWidth={420}
        collapsedWidth={76}
        reserve={320}
        onWidthChange={setWidth}
        resizeLabel="Resize sidebar"
        header={
          <div class="grid h-12 grid-cols-[var(--sidebar-width)_1fr] items-center border-b border-edge text-sm">
            <span class="px-4 font-semibold">Header</span>
            <span class="text-muted">Lines up with the sidebar edge</span>
          </div>
        }
        sidebar={
          <div class="flex h-full flex-col border-r border-edge p-3 text-sm">
            <span class="group-data-[sidebar=collapsed]/sidebar:hidden">
              Sidebar, {width ?? "default"} px
            </span>
            <span class="hidden group-data-[sidebar=collapsed]/sidebar:inline">
              Icons
            </span>
          </div>
        }
      >
        <div class="flex h-full items-center justify-center bg-panel text-sm">
          Main content
        </div>
      </SidebarLayout>
    </div>
  );
}

function SidebarLayoutDemo() {
  return (
    <div class="space-y-6">
      <GalleryRow label="Default width: drag the edge from 180 to 420px; below 180 it snaps to the 76px icon rail; arrows step 16px (Shift 64), Home collapses, End widens, Enter or double-click resets">
        <SidebarExample />
      </GalleryRow>
      <GalleryRow label="Collapsed to the icon rail">
        <SidebarExample initial={76} />
      </GalleryRow>
      <GalleryRow label="At the widest">
        <SidebarExample initial={420} />
      </GalleryRow>
    </div>
  );
}

export const sidebarLayoutGallery: GalleryEntry = {
  title: "SidebarLayout",
  exports: ["SidebarLayout"],
  Demo: SidebarLayoutDemo,
};
