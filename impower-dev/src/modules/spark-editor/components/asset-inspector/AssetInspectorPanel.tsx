import {
  Button,
  ChevronRight,
  Download,
  Search,
} from "@impower/impower-ui/components";
import { useEffect, useState } from "preact/hooks";
import type { PreviewKind } from "../file-preview/FilePreviewOverlay";
import type { UsageLocation } from "../file-list/FileUsagesPanel";

export type AssetInspectorPanelProps = {
  /** Project-relative path (identity — refetch metadata/usages when it changes). */
  path: string;
  name: string;
  kind: PreviewKind;
  /** URL to probe for intrinsic dimensions / duration. */
  src?: string;
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
  size,
  modified,
  defaultCollapsed = false,
  fill = false,
}: AssetInspectorPanelProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [dims, setDims] = useState<string | null>(null);
  const [usages, setUsages] = useState<UsageLocation[] | null>(null);

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
          </div>
        </div>
      )}
    </div>
  );
}
