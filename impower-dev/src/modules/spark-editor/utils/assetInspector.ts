import { signal } from "@preact/signals";
import type { PreviewKind } from "../components/file-preview/FilePreviewOverlay";

export interface InspectedAsset {
  path: string;
  name: string;
  src?: string;
  kind: PreviewKind;
  url?: string;
  size?: number;
  modified?: number;
}

export const inspectedAsset = signal<InspectedAsset | null>(null);

export function inspectAsset(asset: InspectedAsset | null) {
  inspectedAsset.value = asset;
}
