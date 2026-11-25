import type { Layout } from "@impower/impower-ui/layout";

export const previewInStrip = (layout: Layout) => layout !== "desktop";

export const previewDocksPanel = (layout: Layout, revealed: boolean | undefined) =>
  layout === "desktop" || (layout === "compact" && !!revealed);
