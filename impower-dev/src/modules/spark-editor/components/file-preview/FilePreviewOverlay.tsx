import {
  Button,
  Check,
  ChevronRight,
  FileText,
  Pencil,
  X,
} from "@impower/impower-ui/components";
import { createPortal } from "preact/compat";
import { useEffect, useRef, useState } from "preact/hooks";
import { useMountTransition } from "../../hooks/useMountTransition";
import AssetInspectorPanel from "../asset-inspector/AssetInspectorPanel";
import AudioPreview from "./AudioPreview";
import ImagePreview from "./ImagePreview";
import TextPreview from "./TextPreview";

export type PreviewKind = "image" | "audio" | "video" | "text";

export type PreviewItem = {
  path: string;
  name: string;
  src?: string;
  kind: PreviewKind;
  url?: string;
  size?: number;
  modified?: number;
};

export type FilePreviewOverlayProps = {
  open: boolean;
  items: PreviewItem[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  onEditUrl?: (item: PreviewItem, newUrl: string) => void;
  showDetails?: boolean;
};

export default function FilePreviewOverlay({
  open,
  items,
  index,
  onIndexChange,
  onClose,
  onEditUrl,
  showDetails = true,
}: FilePreviewOverlayProps) {
  const { mounted, visible } = useMountTransition(open, 200);
  const lastIndex = useRef(index);
  if (open) {
    lastIndex.current = index;
  }
  const item = items[open ? index : lastIndex.current];
  const total = items.length;

  const [editingUrl, setEditingUrl] = useState<string | null>(null);
  const urlInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    setEditingUrl(null);
  }, [index, open]);
  useEffect(() => {
    if (editingUrl == null) {
      return;
    }
    const id = requestAnimationFrame(() => {
      urlInputRef.current?.focus();
      urlInputRef.current?.select();
    });
    return () => cancelAnimationFrame(id);
  }, [editingUrl]);

  const commitUrl = () => {
    const next = (editingUrl ?? "").trim();
    if (item && next && next !== item.url) {
      onEditUrl?.(item, next);
    }
    setEditingUrl(null);
  };

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
      <div class="flex flex-none flex-row items-center gap-3 px-4 py-3">
        <div class="min-w-0 flex-1">
          <div class="truncate text-sm font-semibold">{item.name}</div>
          {item.url != null &&
            (editingUrl != null ? (
              <div class="mt-0.5 flex flex-row items-center gap-1">
                <input
                  ref={urlInputRef}
                  value={editingUrl}
                  onInput={(e) =>
                    setEditingUrl((e.target as HTMLInputElement).value)
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitUrl();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      setEditingUrl(null);
                    }
                  }}
                  class="min-w-0 flex-1 select-text rounded bg-white/10 px-1.5 py-0.5 text-xs text-white outline-none ring-1 ring-white/20 focus:ring-white/40"
                />
                <Button
                  variant="ghost"
                  aria-label="Save URL"
                  onClick={commitUrl}
                  class="size-6 flex-none rounded-full p-0 text-white/70 hover:text-white"
                >
                  <Check class="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  aria-label="Cancel"
                  onClick={() => setEditingUrl(null)}
                  class="size-6 flex-none rounded-full p-0 text-white/70 hover:text-white"
                >
                  <X class="size-3.5" />
                </Button>
              </div>
            ) : (
              <div class="flex flex-row items-center gap-1">
                <span class="truncate text-xs text-white/50">{item.url}</span>
                {onEditUrl && (
                  <Button
                    variant="ghost"
                    aria-label="Edit URL"
                    onClick={() => setEditingUrl(item.url ?? "")}
                    class="size-6 flex-none rounded-full p-0 text-white/50 hover:text-white"
                  >
                    <Pencil class="size-3.5" />
                  </Button>
                )}
              </div>
            ))}
        </div>
        <Button
          variant="ghost"
          aria-label="Close preview"
          onClick={onClose}
          class="size-9 flex-none rounded-full p-0 text-white/70 hover:text-white"
        >
          <X class="size-5" />
        </Button>
      </div>

      <div class="relative flex min-h-0 flex-1 px-4 pb-2">
        <PreviewBody item={item} />
      </div>

      {total > 1 && (
        <div class="flex flex-none flex-row items-center justify-center gap-5 py-3">
          <Button
            variant="ghost"
            aria-label="Previous"
            disabled={index === 0}
            onClick={() => onIndexChange(index - 1)}
            class="size-9 rounded-full p-0 text-white/70 hover:text-white disabled:opacity-25"
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
            class="size-9 rounded-full p-0 text-white/70 hover:text-white disabled:opacity-25"
          >
            <ChevronRight class="size-5" />
          </Button>
        </div>
      )}


      {showDetails && (
      <div class="flex-none text-white">
        <AssetInspectorPanel
          path={item.path}
          name={item.name}
          kind={item.kind}
          src={item.src}
          size={item.size}
          modified={item.modified}
          defaultCollapsed
          onNavigateAway={onClose}
        />
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
      return <ImagePreview key={item.path} src={src} alt={name} />;
    case "video":
      return (
        <video
          key={item.path}
          src={src}
          controls
          class="size-full object-contain"
        />
      );
    case "audio":
      return <AudioPreview key={item.path} src={src} />;
    case "text":
      return <TextPreview key={item.path} src={src} />;
    default:
      return (
        <div class="m-auto flex flex-col items-center gap-4 text-white/40">
          <FileText class="size-16" />
          <span class="text-sm">No preview available.</span>
        </div>
      );
  }
}
