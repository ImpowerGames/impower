import type { SparkDiagnostic } from "@impower/sparkdown/src/compiler/types/SparkDiagnostic";
import { onProtocolMessage } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { CompiledProgramMessage } from "@impower/sparkdown/src/compiler/classes/messages/CompiledProgramMessage";
import {
  Button,
  CheckIcon,
  ChevronIcon,
  CloseIcon,
  DownloadIcon,
  LinkIcon,
  LoopIcon,
  PencilIcon,
  SearchIcon,
} from "@impower/impower-ui/components";
import { useEffect, useRef, useState } from "preact/hooks";
import type { PreviewKind } from "../file-preview/FilePreviewOverlay";
import type { UsageLocation } from "../file-list/FileUsagesPanel";

export type AssetInspectorPanelProps = {
  path: string;
  name: string;
  kind: PreviewKind;
  src?: string;
  url?: string;
  onEditUrl?: (newUrl: string) => void;
  size?: number;
  modified?: number;
  defaultCollapsed?: boolean;
  fill?: boolean;
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
  const [diagnostics, setDiagnostics] = useState<SparkDiagnostic[] | null>(null);
  const [diagnosticsError, setDiagnosticsError] = useState(false);
  const [usages, setUsages] = useState<UsageLocation[] | null>(null);

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

  useEffect(() => {
    let alive = true;
    let request = 0;
    setDiagnostics(null);
    setDiagnosticsError(false);
    let disposePublished: (() => void) | undefined;
    const refresh = async () => {
      const current = ++request;
      try {
        const { Workspace } = await import("../../workspace/Workspace");
        const store = (await import("../../workspace/WorkspaceStore")).default;
        if (alive && !disposePublished) {
          disposePublished = Workspace.ls.onPublishedDiagnostics(({ uri }) => {
            const id = store.signals.projectId.value;
            if (id && uri === Workspace.fs.getFileUri(id, path)) void refresh();
          });
        }
        const pid = store.signals.projectId.value;
        const items = pid ? await Workspace.ls.getFileDiagnostics(
          Workspace.fs.getFileUri(pid, path),
        ) : [];
        if (alive && current === request) {
          setDiagnostics(items);
          setDiagnosticsError(false);
        }
      } catch {
        if (alive && current === request) setDiagnosticsError(true);
      }
    };
    const dispose = onProtocolMessage(CompiledProgramMessage.type, () => { void refresh(); });
    void refresh();
    return () => { alive = false; dispose(); disposePublished?.(); };
  }, [path]);

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
      await Workspace.window.revealDocument(uri, range);
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
    input.value = "";
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
      <Button
        variant="quiet"
        onClick={() => setCollapsed((c) => !c)}
        class="h-11 w-full flex-none justify-start gap-2 rounded-none px-4 text-left font-semibold text-foreground"
        aria-expanded={!collapsed}
      >
        <ChevronIcon
          class={`size-4 flex-none text-foreground/50 motion-safe:transition-transform ${
            collapsed ? "" : "rotate-90"
          }`}
        />
        <span class="min-w-0 flex-1 truncate">Details</span>
        {!!diagnostics?.length && (
          <span class="text-xs font-normal" aria-live="polite">
            {diagnostics.length} {diagnostics.length === 1 ? "problem" : "problems"}
          </span>
        )}
      </Button>

      {!collapsed && (
        <div
          class={`${fill ? "min-h-0 flex-1 overflow-y-auto" : ""} px-4 pb-4`}
        >
          <section aria-label="Asset problems" class="border-b border-foreground/10 py-2 mb-2">
            <h3 class="text-xs uppercase tracking-wide text-foreground/60">Problems{diagnostics?.length ? ` (${diagnostics.length})` : ""}</h3>
            {diagnosticsError ? (
              <p class="py-1 text-sm text-foreground/60">Unable to load problems.</p>
            ) : diagnostics === null ? (
              <p class="py-1 text-sm text-foreground/60">Checking problems…</p>
            ) : diagnostics.length === 0 ? (
              <p class="py-1 text-sm text-foreground/60">No problems</p>
            ) : (
              <ul class="space-y-2 py-2">
                {diagnostics.map((diagnostic, index) => (
                  <li key={index} class="select-text break-words text-sm text-foreground/80">
                    <span class="font-semibold">{diagnostic.severity === 1 ? "Error" : diagnostic.severity === 2 ? "Warning" : "Info"}: </span>
                    {typeof diagnostic.message === "string" ? diagnostic.message : diagnostic.message.value}
                  </li>
                ))}
              </ul>
            )}
          </section>
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


          {url != null && (
            <div class="pb-2 pt-1">
              <div class="flex flex-row items-center gap-2 pb-1 text-xs uppercase tracking-wide text-foreground/40">
                <LinkIcon class="size-3.5 flex-none" />
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
                    class="min-h-11 min-w-0 flex-1 select-text rounded-control border border-edge bg-transparent px-2 text-sm text-ink"
                  />
                  <Button
                    variant="quiet"
                    aria-label="Save URL"
                    onClick={commitUrl}
                    size="icon"
                    class="flex-none text-muted"
                  >
                    <CheckIcon class="size-4" />
                  </Button>
                  <Button
                    variant="quiet"
                    aria-label="Cancel"
                    onClick={() => setEditingUrl(null)}
                    size="icon"
                    class="flex-none text-muted"
                  >
                    <CloseIcon class="size-4" />
                  </Button>
                </div>
              ) : (
                <div class="flex flex-row items-center gap-1">
                  {isSafeHttpUrl(url) ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer noopener"
                      class="min-w-0 flex-1 truncate text-sm text-primary hover:underline"
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
                      variant="quiet"
                      aria-label="Edit URL"
                      onClick={() => setEditingUrl(url ?? "")}
                      size="icon"
                      class="flex-none text-muted"
                    >
                      <PencilIcon class="size-4" />
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          <div class="pt-2">
            <div class="flex flex-row items-center gap-2 pb-1 text-xs uppercase tracking-wide text-foreground/40">
              <SearchIcon class="size-3.5 flex-none" />
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
                    variant="quiet"
                    onClick={() => onJump(loc.uri, loc.range)}
                    class="h-auto w-full justify-start gap-2 rounded-none px-4 py-1.5 text-left font-normal"
                  >
                    <span class="min-w-0 flex-1 truncate text-sm text-foreground/80">
                      {loc.label}
                    </span>
                    <span class="flex-none text-xs tabular-nums text-foreground/40">
                      :{loc.line}
                    </span>
                    <ChevronIcon class="size-4 flex-none text-foreground/30" />
                  </Button>
                ))}
              </div>
            )}
          </div>

          <div class="flex flex-row gap-2 pt-4">
            <Button
              onClick={onDownload}
              class="flex-none"
            >
              <DownloadIcon class="size-4" />
              Download
            </Button>
            {!isUrlAsset && (
              <Button
                onClick={() => replaceInputRef.current?.click()}
                disabled={replacing}
                class="flex-none"
              >
                <LoopIcon class="size-4" />
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
