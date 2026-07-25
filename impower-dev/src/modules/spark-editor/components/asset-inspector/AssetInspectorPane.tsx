import {
  Button,
  FileText,
  Photo,
  X,
} from "@impower/impower-ui/components";
import { useState } from "preact/hooks";
import { inspectAsset, inspectedAsset } from "../../utils/assetInspector";
import FilePreviewOverlay, {
  type PreviewItem,
} from "../file-preview/FilePreviewOverlay";
import AssetInspectorPanel from "./AssetInspectorPanel";

/**
 * Desktop "select-to-inspect" right pane. Selecting an asset in the Assets
 * browser routes MainWindow's right pane here (in place of the game preview).
 * Top half = the asset preview (click to expand fullscreen); bottom half = the
 * shared collapsible Details panel. Closing clears the selection so the game
 * preview returns.
 */
export default function AssetInspectorPane() {
  const asset = inspectedAsset.value;
  const [fullscreen, setFullscreen] = useState(false);

  // Rewrite a `.url` asset's target. The reload re-resolves the asset and the
  // FileList sync effect refreshes `inspectedAsset`, so this pane (and its
  // preview) update to the new URL without a re-select. No-op for a local asset
  // (they have no `url`, so the edit affordance never shows).
  const onEditUrl = async (newUrl: string) => {
    const store = (await import("../../workspace/WorkspaceStore")).default;
    const pid = store.signals.projectId.value;
    if (!pid || !asset) return;
    const { writeUrlAsset } = await import("../../utils/urlAsset");
    await writeUrlAsset(pid, asset.path, newUrl);
  };

  if (!asset) {
    return null;
  }

  const item: PreviewItem = {
    path: asset.path,
    name: asset.name,
    src: asset.src,
    kind: asset.kind,
    url: asset.url,
    size: asset.size,
    modified: asset.modified,
  };

  return (
    <div class="flex h-full w-full flex-col bg-engine-800 text-foreground">
      {/* Header: name + close (→ back to game preview). */}
      <div class="flex flex-none flex-row items-center gap-2 px-4 py-3">
        <div class="min-w-0 flex-1 truncate text-sm font-semibold">
          {asset.name}
        </div>
        <Button
          variant="ghost"
          aria-label="Close inspector"
          onClick={() => inspectAsset(null)}
          class="size-7 flex-none rounded-full p-0 text-foreground/60 hover:bg-foreground/10 hover:text-foreground"
        >
          <X class="size-4" />
        </Button>
      </div>

      {/* Preview (top half). Click to expand fullscreen. */}
      <button
        type="button"
        onClick={() => setFullscreen(true)}
        class="group relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black p-4"
        aria-label="Expand preview"
      >
        <PreviewThumb item={item} />
        <span class="pointer-events-none absolute bottom-2 right-3 rounded bg-black/60 px-2 py-0.5 text-xs text-white/70 opacity-0 transition-opacity group-hover:opacity-100">
          Click to expand
        </span>
      </button>

      {/* Details (bottom half) — the shared collapsible panel. Passing
          `url`/`onEditUrl` makes the Source URL field editable for `.url`
          assets (the mobile host edits from the preview header instead). */}
      <AssetInspectorPanel
        path={asset.path}
        name={asset.name}
        kind={asset.kind}
        src={asset.src}
        url={asset.url}
        onEditUrl={onEditUrl}
        size={asset.size}
        modified={asset.modified}
        fill={false}
      />

      <FilePreviewOverlay
        open={fullscreen}
        items={[item]}
        index={0}
        onIndexChange={() => {}}
        onClose={() => setFullscreen(false)}
        // The enlarged view keeps the URL editable too, so a `.url` asset can be
        // retargeted from fullscreen — consistent with the Details field below.
        onEditUrl={(_item, newUrl) => onEditUrl(newUrl)}
        // The inspector already shows Details beside the media; the fullscreen
        // here is purely to enlarge the preview.
        showDetails={false}
      />
    </div>
  );
}

/** A static, non-interactive preview for the top half (the click target is the
 * wrapping button). Image/video render inline; audio/text show a large icon. */
function PreviewThumb({ item }: { item: PreviewItem }) {
  const { src, kind, name } = item;
  if (src && kind === "image") {
    return (
      <img
        src={src}
        alt={name}
        class="max-h-full max-w-full object-contain"
        draggable={false}
      />
    );
  }
  if (src && kind === "video") {
    return (
      <video src={src} class="max-h-full max-w-full object-contain" muted />
    );
  }
  return (
    <div class="flex flex-col items-center gap-3 text-white/40">
      {kind === "audio" ? (
        <Photo class="size-16" />
      ) : (
        <FileText class="size-16" />
      )}
      <span class="text-sm">{name}</span>
    </div>
  );
}
