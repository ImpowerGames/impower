import { signal } from "@preact/signals";
import type { PreviewKind } from "../components/file-preview/FilePreviewOverlay";

/**
 * The asset shown in the desktop "select-to-inspect" right pane. Selecting an
 * asset in the Assets browser sets this; the MainWindow routes its right pane to
 * the inspector while it's non-null (and pane === "assets"), else the game
 * preview. Clearing it (deselect / close / folder click) restores the preview.
 *
 * A module signal (mirroring undoManager) rather than component state because
 * the setter (FileList, in the left pane) and the reader (MainWindow's right
 * pane) live in different subtrees.
 */
export interface InspectedAsset {
  /** Project-relative path (identity). */
  path: string;
  name: string;
  /** Service-worker/remote URL to load for the preview + media metadata. */
  src?: string;
  kind: PreviewKind;
  /** For a `.url` asset: the remote URL. */
  url?: string;
  /** From FileData — bytes on disk (absent for remote `.url` assets). */
  size?: number;
  /** From FileData — last-modified epoch ms. */
  modified?: number;
}

export const inspectedAsset = signal<InspectedAsset | null>(null);

/** Show `asset` in the desktop inspector, or clear it with `null`. */
export function inspectAsset(asset: InspectedAsset | null) {
  inspectedAsset.value = asset;
}
