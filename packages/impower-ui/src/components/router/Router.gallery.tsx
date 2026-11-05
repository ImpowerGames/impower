import { useState } from "preact/hooks";
import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import Button from "../button/Button";
import Router, { type RouterProps } from "./Router";

const PAGES = ["one", "two", "three"] as const;

function RouterExample({ mode }: { mode: NonNullable<RouterProps["mode"]> }) {
  const [active, setActive] = useState<string>(PAGES[0]);
  return (
    <div class="w-80 space-y-2">
      <div class="flex gap-2">
        {PAGES.map((page) => (
          <Button
            key={page}
            variant={page === active ? "primary" : "default"}
            onClick={() => setActive(page)}
          >
            {page}
          </Button>
        ))}
      </div>
      <div class="h-24 overflow-hidden rounded border border-surface-border bg-surface">
        <Router active={active} mode={mode}>
          {PAGES.map((page) => (
            <div key={page} class="flex h-full items-center justify-center text-sm">
              Page {page}
            </div>
          ))}
        </Router>
      </div>
    </div>
  );
}

function RouterDemo() {
  return (
    <div class="flex flex-wrap gap-6">
      <GalleryRow label='mode="fade" (default)'>
        <RouterExample mode="fade" />
      </GalleryRow>
      <GalleryRow label='mode="slide-x"'>
        <RouterExample mode="slide-x" />
      </GalleryRow>
      <GalleryRow label='mode="zoom"'>
        <RouterExample mode="zoom" />
      </GalleryRow>
    </div>
  );
}

export const routerGallery: GalleryEntry = {
  title: "Router",
  exports: ["Router"],
  Demo: RouterDemo,
};
