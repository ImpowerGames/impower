import {
  Button,
  Check,
  ChevronRight,
  Download,
  Link,
  Pencil,
  Repeat,
  Search,
  X,
} from "@impower/impower-ui/components";
import { useEffect, useRef, useState } from "preact/hooks";
import type { PreviewKind } from "../file-preview/FilePreviewOverlay";
import type { UsageLocation } from "../file-list/FileUsagesPanel";

export type AssetInspectorPanelProps = {
  /** Project-relative path (identity — refetch metadata/usages when it changes). */
  path: string;
  name: string;
  kind: PreviewKind;
  /** URL to probe for intrinsic dimensions / duration. */
  src?: string;
  /**
   * For a remote `.url` asset: its target URL. When set alongside `onEditUrl`,
   * the Details panel shows an editable "Source URL" field; a host that only
   * reads (or a non-`.url` asset) omits it and the field doesn't render.
   */
  url?: string;
  /**
   * Commit a new target URL for a `.url` asset. Present ⇒ the Source URL field
   * is editable (pencil → input → save). The host writes the `.url` file and
   * re-resolves the asset (see `writeUrlAsset`).
   */
  onEditUrl?: (newUrl: string) => void;
  /** Bytes on disk (absent for a remote `.url` asset). */
  size?: number;
  /** Last-modified epoch ms. */
  modified?: number;
  /**
   * Whether the details body starts collapsed. The header (name + chevron) always
   * shows; the chevron toggles the metadata/usages body — mirrors the collapsible
   * details on the mobile fullscreen preview so the same panel serves both hosts.
   */
  defaultCollapsed?: boolean;
  /** Fill the height and scroll the body (desktop right pane). */
  fill?: boolean;
  /**
   * Called after a jump-to-usage navigates to a script. The mobile host (the
   * fullscreen preview) passes its close so jumping reveals the editor; the
   * desktop host omits it (the inspector stays beside the editor).
   */
  onNavigateAway?: () => void;
};

const humanBytes = (n: number): string => {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
};

const formatDuration = (seconds: number): string => {
  if (!isFinite(seconds)) return "—";
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, "0")}`;
};

/** Whether a URL is safe to render as a clickable `<a href>` — only http(s)
 * (and protocol-relative). Guards against `javascript:` / `data:` targets that
 * would execute on click; such URLs still show as plain (non-link) text. */
const isSafeHttpUrl = (u: string): boolean =>
  /^(https?:)?\/\//i.test(u.trim());

const formatModified = (ms: number): string => {
  try {
    return new Date(ms).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return "—";
  }
};

/** Probe a media URL for its intrinsic dimensions (image/video) or duration
 * (audio/video) client-side. Resolves `null` if the media can't be read. */
function probeMedia(
  src: string,
  kind: PreviewKind,
): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve(null);
      return;
    }
    if (kind === "image") {
      const img = new Image();
      img.onload = () => resolve(`${img.naturalWidth} × ${img.naturalHeight}`);
      img.onerror = () => resolve(null);
      img.src = src;
      return;
    }
    if (kind === "audio" || kind === "video") {
      const el = document.createElement(kind);
      el.preload = "metadata";
      el.onloadedmetadata = () => {
        const dur = formatDuration(el.duration);
        if (kind === "video") {
          const v = el as HTMLVideoElement;
          resolve(`${v.videoWidth} × ${v.videoHeight} · ${dur}`);
        } else {
          resolve(dur);
        }
      };
      el.onerror = () => resolve(null);
      el.src = src;
      return;
    }
    resolve(null);
  });
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div class="flex flex-row items-baseline gap-3 py-1">
      <span class="w-24 flex-none text-xs uppercase tracking-wide text-foreground/40">
        {label}
      </span>
      <span class="min-w-0 flex-1 truncate text-sm text-foreground/80">
        {value}
      </span>
    </div>
  );
}

/**
 * The asset "Details": a collapsible metadata + where-used + download panel.
 * Shared by the desktop right-pane inspector (bottom half) and the mobile
 * fullscreen preview (docked section). Fetches its own metadata/usages from the
 * `path`, so a host just supplies the identity + what it already knows.
 */
export default function AssetInspectorPanel({
  path,
  name,
  kind,
  src,
  url,
  onEditUrl,
  size,
  modified,
  defaultCollapsed = false,
  fill = false,
  onNavigateAway,
}: AssetInspectorPanelProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [dims, setDims] = useState<string | null>(null);
  const [usages, setUsages] = useState<UsageLocation[] | null>(null);

  // Source-URL editor (`.url` assets): `null` = not editing; a string = the
  // in-progress URL. Reset whenever the asset (`path`) or its resolved `url`
  // changes so a reload — including our own commit landing — shows the fresh
  // value rather than a stale edit buffer.
  const [editingUrl, setEditingUrl] = useState<string | null>(null);
  const urlInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    setEditingUrl(null);
  }, [path, url]);
  useEffect(() => {
    if (editingUrl == null) return;
    const id = requestAnimationFrame(() => {
      urlInputRef.current?.focus();
      urlInputRef.current?.select();
    });
    return () => cancelAnimationFrame(id);
  }, [editingUrl]);

  const commitUrl = () => {
    const next = (editingUrl ?? "").trim();
    if (next && next !== url) {
      onEditUrl?.(next);
    }
    setEditingUrl(null);
  };

  // Probe intrinsic dimensions / duration for the current asset. Guarded so a
  // late resolve for a previous asset can't overwrite the current one.
  useEffect(() => {
    setDims(null);
    if (!src) return;
    let alive = true;
    void probeMedia(src, kind).then((d) => {
      if (alive) setDims(d);
    });
    return () => {
      alive = false;
    };
  }, [src, kind]);

  // Where-used: ask the language server which script locations reference this
  // asset by name (same plumbing as the 3-dots "Find usages"). `null` = loading.
  useEffect(() => {
    let alive = true;
    setUsages(null);
    void (async () => {
      const { Workspace } = await import("../../workspace/Workspace");
      const store = (await import("../../workspace/WorkspaceStore")).default;
      const pid = store.signals.projectId.value;
      if (!pid) {
        if (alive) setUsages([]);
        return;
      }
      let refs: { uri: string; range: UsageLocation["range"] }[] = [];
      try {
        refs = await Workspace.ls.getFileReferences(
          Workspace.fs.getFileUri(pid, path),
        );
      } catch {
        refs = [];
      }
      const locations: UsageLocation[] = refs.map((r) => ({
        uri: r.uri,
        label: Workspace.fs.getRelativePath(pid, r.uri),
        line: r.range.start.line + 1,
        range: r.range,
      }));
      if (alive) setUsages(locations);
    })();
    return () => {
      alive = false;
    };
  }, [path]);

  const onJump = (uri: string, range: UsageLocation["range"]) => {
    void (async () => {
      const { Workspace } = await import("../../workspace/Workspace");
      await Workspace.window.showDocument(uri, range, true);
      onNavigateAway?.();
    })();
  };

  const onDownload = () => {
    void (async () => {
      const { Workspace } = await import("../../workspace/Workspace");
      const store = (await import("../../workspace/WorkspaceStore")).default;
      const pid = store.signals.projectId.value;
      if (!pid) return;
      const { downloadFile } = await import("../../utils/downloadFile");
      const uri = Workspace.fs.getFileUri(pid, path);
      const data = await Workspace.fs.readFile({ file: { uri } });
      downloadFile(name, "application/octet-stream", data);
    })();
  };

  // Replace: swap this asset's bytes for a picked file, keeping the path (so its
  // id and references still resolve). A `.url` asset has no local bytes to swap
  // (its URL is edited in the preview), so Replace is hidden for it.
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const [replacing, setReplacing] = useState(false);
  const isUrlAsset = path.endsWith(".url");
  const acceptFor =
    kind === "image"
      ? "image/*"
      : kind === "audio"
        ? "audio/*"
        : kind === "video"
          ? "video/*"
          : undefined;

  const onPickReplacement = (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ""; // allow re-picking the same file next time
    if (!file) return;
    setReplacing(true);
    void (async () => {
      try {
        const store = (await import("../../workspace/WorkspaceStore")).default;
        const pid = store.signals.projectId.value;
        if (!pid) return;
        const data = await file.arrayBuffer();
        const { replaceAssetFile } = await import("../../utils/fileUndo");
        await replaceAssetFile(pid, path, data, name);
      } finally {
        setReplacing(false);
      }
    })();
  };

  const usageCount = usages?.length ?? 0;

  return (
    <div
      class={`flex flex-col ${fill ? "min-h-0 flex-1" : ""} border-t border-foreground/10`}
    >
      {/* Collapse header. */}
      <Button
        variant="ghost"
        onClick={() => setCollapsed((c) => !c)}
        class="h-11 w-full flex-none justify-start gap-2 rounded-none px-4 text-left font-semibold text-foreground"
        aria-expanded={!collapsed}
      >
        <ChevronRight
          class={`size-4 flex-none text-foreground/50 transition-transform ${
            collapsed ? "" : "rotate-90"
          }`}
        />
        <span class="min-w-0 flex-1 truncate">Details</span>
      </Button>

      {!collapsed && (
        <div
          class={`${fill ? "min-h-0 flex-1 overflow-y-auto" : ""} px-4 pb-4`}
        >
          {/* Metadata. */}
          <div class="pb-2">
            <MetaRow label="Type" value={kind} />
            {dims && (
              <MetaRow
                label={kind === "audio" ? "Duration" : "Dimensions"}
                value={dims}
              />
            )}
            {size != null && <MetaRow label="Size" value={humanBytes(size)} />}
            {modified != null && (
              <MetaRow label="Modified" value={formatModified(modified)} />
            )}
          </div>

          {/* Source URL (`.url` assets only). Read: truncated link (opens the
              remote target). Edit (when `onEditUrl` is set): pencil → input →
              save/cancel — the same interaction as the mobile preview header,
              styled for the panel. Enter saves, Escape cancels. */}
          {url != null && (
            <div class="pb-2 pt-1">
              <div class="flex flex-row items-center gap-2 pb-1 text-xs uppercase tracking-wide text-foreground/40">
                <Link class="size-3.5 flex-none" />
                <span>Source URL</span>
              </div>
              {editingUrl != null ? (
                <div class="flex flex-row items-center gap-1">
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
                    class="min-w-0 flex-1 select-text rounded bg-foreground/10 px-2 py-1 text-sm text-foreground outline-none ring-1 ring-foreground/15 focus:ring-foreground/30"
                  />
                  <Button
                    variant="ghost"
                    aria-label="Save URL"
                    onClick={commitUrl}
                    class="size-7 flex-none rounded-full p-0 text-foreground/60 hover:bg-foreground/10 hover:text-foreground"
                  >
                    <Check class="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    aria-label="Cancel"
                    onClick={() => setEditingUrl(null)}
                    class="size-7 flex-none rounded-full p-0 text-foreground/60 hover:bg-foreground/10 hover:text-foreground"
                  >
                    <X class="size-4" />
                  </Button>
                </div>
              ) : (
                <div class="flex flex-row items-center gap-1">
                  {isSafeHttpUrl(url) ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer noopener"
                      class="min-w-0 flex-1 truncate text-sm text-sky-400 hover:underline"
                    >
                      {url}
                    </a>
                  ) : (
                    <span class="min-w-0 flex-1 truncate text-sm text-foreground/80">
                      {url}
                    </span>
                  )}
                  {onEditUrl && (
                    <Button
                      variant="ghost"
                      aria-label="Edit URL"
                      onClick={() => setEditingUrl(url ?? "")}
                      class="size-7 flex-none rounded-full p-0 text-foreground/50 hover:bg-foreground/10 hover:text-foreground"
                    >
                      <Pencil class="size-4" />
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Where-used. */}
          <div class="pt-2">
            <div class="flex flex-row items-center gap-2 pb-1 text-xs uppercase tracking-wide text-foreground/40">
              <Search class="size-3.5 flex-none" />
              <span>
                {usages == null
                  ? "Used in …"
                  : usageCount === 0
                    ? "Not used"
                    : `Used in ${usageCount} place${usageCount === 1 ? "" : "s"}`}
              </span>
            </div>
            {usages != null && usageCount > 0 && (
              <div class="-mx-4">
                {usages.map((loc) => (
                  <Button
                    key={`${loc.uri}:${loc.line}:${loc.range.start.character}`}
                    variant="ghost"
                    onClick={() => onJump(loc.uri, loc.range)}
                    class="h-auto w-full justify-start gap-2 rounded-none px-4 py-1.5 text-left font-normal"
                  >
                    <span class="min-w-0 flex-1 truncate text-sm text-foreground/80">
                      {loc.label}
                    </span>
                    <span class="flex-none text-xs tabular-nums text-foreground/40">
                      :{loc.line}
                    </span>
                    <ChevronRight class="size-4 flex-none text-foreground/30" />
                  </Button>
                ))}
              </div>
            )}
          </div>

          {/* Actions. */}
          <div class="flex flex-row gap-2 pt-4">
            <Button
              variant="outline"
              onClick={onDownload}
              class="h-9 flex-none gap-2 px-3 text-sm"
            >
              <Download class="size-4" />
              Download
            </Button>
            {!isUrlAsset && (
              <Button
                variant="outline"
                onClick={() => replaceInputRef.current?.click()}
                disabled={replacing}
                class="h-9 flex-none gap-2 px-3 text-sm"
              >
                <Repeat class="size-4" />
                {replacing ? "Replacing…" : "Replace"}
              </Button>
            )}
            <input
              ref={replaceInputRef}
              type="file"
              accept={acceptFor}
              class="hidden"
              onChange={onPickReplacement}
            />
          </div>
        </div>
      )}
    </div>
  );
}
