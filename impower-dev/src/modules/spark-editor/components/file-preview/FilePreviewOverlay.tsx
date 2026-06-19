import {
  Button,
  ChevronRight,
  FileText,
  Music,
  X,
} from "@impower/impower-ui/components";
import { createPortal } from "preact/compat";
import { useEffect, useRef } from "preact/hooks";
import { useMountTransition } from "../../hooks/useMountTransition";
import ImagePreview from "./ImagePreview";

/** A previewable asset. `kind` is the resolved media category. */
export type PreviewKind = "image" | "audio" | "video" | "text";

export type PreviewItem = {
  /** Project-relative path (identity). */
  path: string;
  /** Display name. */
  name: string;
  /** The URL to load (service-worker URL for local files, remote for `.url`). */
  src?: string;
  kind: PreviewKind;
  /** For a `.url` asset: the remote URL, shown under the title. */
  url?: string;
};

export type FilePreviewOverlayProps = {
  /** Whether the preview is open (animates in/out). */
  open: boolean;
  /** The navigable list (previewable files in display order). */
  items: PreviewItem[];
  /** Index of the item currently shown. */
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
};

/**
 * Fullscreen asset preview (a faithful preact port of the old engine's
 * slide-up preview dialog). Renders the current item by media type — a
 * zoom/pan/pinch image, a native video/audio player, or an embedded text view —
 * with a bottom `‹ N / M ›` navigator that cycles the previewable list. Escape
 * closes; ← / → step. Portaled to <body> so nothing clips the fixed overlay.
 */
export default function FilePreviewOverlay({
  open,
  items,
  index,
  onIndexChange,
  onClose,
}: FilePreviewOverlayProps) {
  const { mounted, visible } = useMountTransition(open, 200);
  // Keep showing the last item while animating out (the parent clears its index
  // on close, but we want the closing frame to still render what was open).
  const lastIndex = useRef(index);
  if (open) {
    lastIndex.current = index;
  }
  const item = items[open ? index : lastIndex.current];
  const total = items.length;

  // Keyboard: Escape closes, arrows step (the old engine was click-only).
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft" && index > 0) {
        onIndexChange(index - 1);
      } else if (e.key === "ArrowRight" && index < total - 1) {
        onIndexChange(index + 1);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, index, total, onClose, onIndexChange]);

  if (!mounted || !item || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      class={`fixed inset-0 z-50 bg-black transition-opacity duration-200 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      <div
        class={`absolute inset-0 flex select-none flex-col text-white transition-transform duration-200 ease-out ${
          visible ? "translate-y-0" : "translate-y-3"
        }`}
      >
      {/* Header: name (+ remote URL for url assets) and close. */}
      <div class="flex flex-none flex-row items-center gap-3 px-4 py-3">
        <div class="min-w-0 flex-1">
          <div class="truncate text-sm font-semibold">{item.name}</div>
          {item.url && (
            <div class="truncate text-xs text-white/50">{item.url}</div>
          )}
        </div>
        <Button
          variant="ghost"
          aria-label="Close preview"
          onClick={onClose}
          class="size-9 flex-none rounded-full p-0 text-white/70 hover:bg-white/10 hover:text-white"
        >
          <X class="size-5" />
        </Button>
      </div>

      {/* Preview area. */}
      <div class="relative flex min-h-0 flex-1 px-4 pb-2">
        <PreviewBody item={item} />
      </div>

      {/* `‹ N / M ›` navigator — only when there's more than one item. */}
      {total > 1 && (
        <div class="flex flex-none flex-row items-center justify-center gap-5 py-3">
          <Button
            variant="ghost"
            aria-label="Previous"
            disabled={index === 0}
            onClick={() => onIndexChange(index - 1)}
            class="size-9 rounded-full p-0 text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-25"
          >
            <ChevronRight class="size-5 rotate-180" />
          </Button>
          <span class="select-none text-sm tabular-nums text-white/80">
            {index + 1} / {total}
          </span>
          <Button
            variant="ghost"
            aria-label="Next"
            disabled={index === total - 1}
            onClick={() => onIndexChange(index + 1)}
            class="size-9 rounded-full p-0 text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-25"
          >
            <ChevronRight class="size-5" />
          </Button>
        </div>
      )}
      </div>
    </div>,
    document.body,
  );
}

function PreviewBody({ item }: { item: PreviewItem }) {
  const { src, kind, name } = item;
  if (!src) {
    return (
      <div class="m-auto text-sm text-white/50">No preview available.</div>
    );
  }
  switch (kind) {
    case "image":
      // `key` re-mounts (and resets zoom) when the file changes.
      return <ImagePreview key={item.path} src={src} alt={name} />;
    case "video":
      return (
        <video
          key={item.path}
          src={src}
          controls
          class="m-auto max-h-full max-w-full"
        />
      );
    case "audio":
      return (
        <div class="m-auto flex flex-col items-center gap-6">
          <Music class="size-16 text-white/30" />
          <audio key={item.path} src={src} controls class="w-80 max-w-full" />
        </div>
      );
    case "text":
      return (
        <object
          key={item.path}
          data={src}
          type="text/plain"
          class="size-full rounded bg-white"
          aria-label={name}
        >
          <div class="m-auto text-sm text-white/50">
            Can't preview this file.
          </div>
        </object>
      );
    default:
      return (
        <div class="m-auto flex flex-col items-center gap-4 text-white/40">
          <FileText class="size-16" />
          <span class="text-sm">No preview available.</span>
        </div>
      );
  }
}
