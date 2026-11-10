import {
  BackIcon,
  Button,
  ChevronIcon,
  ChevronLeftIcon,
  CloseIcon,
  DetailList,
  DialogTitle,
  DownloadIcon,
  MessageEntry,
  PanelHead,
  ReplaceSwapIcon,
} from "@impower/impower-ui/components";
import { useLayout } from "@impower/impower-ui/layout";
import type { ComponentChildren, Ref } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { addMenuFolders } from "../../utils/addMenuFolders";
import {
  assetDetails,
  NOT_USED_NOTES,
  titleLine,
  type InspectedAsset,
} from "../../utils/assetDetails";
import { plural } from "../../utils/fileListModel";
import { showSnackbar } from "../../utils/snackbar";
import { assetsHome } from "../../workspace/assetsListing";
import type { Workspace as WorkspaceIntents } from "../../workspace/Workspace";
import type { InspectorFacts } from "../../workspace/WorkspaceAssets";
import { useSettings } from "../../workspace/settings/useSettings";
import workspace from "../../workspace/WorkspaceStore";
import { UsesList } from "../find-references-rename";
import AssetFrame from "./AssetFrame";
import type { InspectorHost } from "./dock";

export type InspectorNeighbor = { path: string; name: string };

export type AssetInspectorProps = {
  asset: InspectedAsset;
  previous: InspectorNeighbor | null;
  next: InspectorNeighbor | null;
  host: InspectorHost;
  intents: () => Promise<typeof WorkspaceIntents>;
  onStep: (path: string) => void;
  onClose: () => void;
  closeRef?: Ref<HTMLButtonElement>;
};

const EMPTY_LISTING = { files: {}, folders: [] };

const SKIPS_ARROWS = "input, textarea, select, video, audio, [contenteditable], [role=slider]";

function Section({
  title,
  aside,
  label,
  children,
}: {
  title: string;
  aside?: string;
  label: string;
  children: ComponentChildren;
}) {
  return (
    <section aria-label={label} class="min-w-0">
      <div class="mb-2 flex items-center justify-between gap-3 border-b border-edge pb-2">
        <h3 class="m-0 text-[13px]/[1.4] font-semibold text-ink">{title}</h3>
        {aside ? <span class="text-[11px] text-muted">{aside}</span> : null}
      </div>
      {children}
    </section>
  );
}

function useAudioSeconds(asset: InspectedAsset) {
  const [seconds, setSeconds] = useState<number | null>(null);
  useEffect(() => {
    setSeconds(null);
    if (asset.type !== "audio" || !asset.src || typeof Audio === "undefined") {
      return;
    }
    const probe = new Audio();
    probe.preload = "metadata";
    probe.onloadedmetadata = () => setSeconds(probe.duration);
    probe.src = asset.src;
    return () => {
      probe.onloadedmetadata = null;
      probe.removeAttribute("src");
    };
  }, [asset.path, asset.src, asset.type]);
  return seconds;
}

const messageOf = (problem: InspectorFacts["problems"][number]) =>
  typeof problem.message === "string" ? problem.message : problem.message.value;

const severityOf = (severity: number | undefined) =>
  severity === 1 ? "error" : severity === 2 ? "warning" : "info";

export default function AssetInspector({
  asset,
  previous,
  next,
  host,
  intents,
  onStep,
  onClose,
  closeRef,
}: AssetInspectorProps) {
  const desktop = useLayout() === "desktop";
  const sheet = host === "sheet";
  const close = useRef<HTMLButtonElement | null>(null);
  const stepButtons = useRef<Record<"previous" | "next", HTMLButtonElement | null>>({
    previous: null,
    next: null,
  });
  const stepped = useRef<"previous" | "next" | null>(null);
  const refocusFrame = useRef(false);
  const body = useRef<HTMLDivElement | null>(null);
  const picker = useRef<HTMLInputElement | null>(null);
  const [facts, setFacts] = useState<InspectorFacts | null>(null);
  const [videoSeconds, setVideoSeconds] = useState<number | null>(null);
  const audioSeconds = useAudioSeconds(asset);
  const { projectSettings } = useSettings();
  const pixels = asset.src ? workspace.assetSizes.value[asset.src] : undefined;
  const filesKey = asset.files.map((file) => file.path).join("\n");

  useEffect(() => {
    close.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    setFacts(null);
    let dispose: (() => void) | undefined;
    let alive = true;
    void intents().then((Workspace) => {
      if (alive) {
        dispose = Workspace.assets.watchFacts(
          asset.files.map((file) => file.path),
          setFacts,
        );
      }
    });
    return () => {
      alive = false;
      dispose?.();
    };
  }, [filesKey]);

  useEffect(() => {
    setVideoSeconds(null);
  }, [asset.path, asset.src]);

  useEffect(() => {
    if (asset.type === "image" && asset.src && pixels === undefined) {
      void intents().then((Workspace) => Workspace.assets.measureImages([asset.path]));
    }
  }, [asset.path, asset.src]);

  useEffect(() => {
    const direction = stepped.current;
    stepped.current = null;
    if (refocusFrame.current) {
      refocusFrame.current = false;
      (body.current?.querySelector<HTMLElement>("[data-zoom-frame][tabindex]") ?? close.current)?.focus({
        preventScroll: true,
      });
      return;
    }
    if (!direction) {
      return;
    }
    const pressed = stepButtons.current[direction];
    if (pressed && !pressed.disabled) {
      pressed.focus({ preventScroll: true });
      return;
    }
    const other = stepButtons.current[direction === "next" ? "previous" : "next"];
    (other && !other.disabled ? other : close.current)?.focus({ preventScroll: true });
  }, [asset.path]);

  const step = (direction: "previous" | "next") => {
    const to = direction === "next" ? next : previous;
    if (to) {
      stepped.current = direction;
      onStep(to.path);
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    if ((event.target as Element | null)?.closest?.(SKIPS_ARROWS)) {
      return;
    }
    const to = event.key === "ArrowLeft" ? previous : next;
    if (to) {
      event.preventDefault();
      const focused = document.activeElement;
      refocusFrame.current = focused instanceof Element && !!focused.closest("[data-zoom-frame]");
      onStep(to.path);
    }
  };

  const onPicked = (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    const chosen = input.files?.[0];
    input.value = "";
    if (!chosen) {
      return;
    }
    void intents()
      .then((Workspace) =>
        Workspace.assets.replace(asset.path, {
          name: chosen.name,
          getBuffer: () => chosen.arrayBuffer(),
        }),
      )
      .catch((error: unknown) =>
        showSnackbar({ message: error instanceof Error ? error.message : String(error) }),
      );
  };

  const rows = assetDetails({
    asset,
    home: assetsHome(workspace.assetListing.value ?? EMPTY_LISTING),
    folders: addMenuFolders(projectSettings),
    measured: {
      pixels: pixels ?? null,
      seconds: asset.type === "audio" ? audioSeconds : asset.type === "video" ? videoSeconds : null,
    },
  });

  const uses = facts?.uses;
  const lines = uses?.reduce((sum, group) => sum + group.uses.length, 0) ?? 0;
  const problems = facts?.problems ?? [];

  const stepButton = (direction: "previous" | "next") => {
    const to = direction === "next" ? next : previous;
    const label = to
      ? `${direction === "next" ? "Next" : "Previous"}: ${to.name}`
      : `No ${direction} item`;
    return (
      <Button
        ref={(element: HTMLButtonElement | null) => {
          stepButtons.current[direction] = element;
        }}
        variant="quiet"
        size="icon"
        class="w-10 text-muted"
        aria-label={label}
        title={label}
        data-inspector-step={direction}
        disabled={!to}
        onClick={() => step(direction)}
      >
        {direction === "next" ? <ChevronIcon /> : <ChevronLeftIcon />}
      </Button>
    );
  };

  return (
    <section
      aria-label="Asset details"
      data-asset-inspector={host}
      class={
        sheet
          ? "flex h-full min-h-0 flex-col bg-panel text-ink"
          : "flex h-full min-h-0 flex-col bg-preview-mat text-ink"
      }
      onKeyDown={onKeyDown}
    >
      <PanelHead
        size={desktop && !sheet ? "tall" : "default"}
        titleSize="sm"
        class="px-2"
        title={
          sheet ? (
            <DialogTitle class="m-0 min-w-0 truncate text-[14px]/[1.4] font-semibold text-ink">{asset.name}</DialogTitle>
          ) : (
            asset.name
          )
        }
        subtitle={titleLine(asset)}
        start={
          <Button
            ref={(element: HTMLButtonElement | null) => {
              close.current = element;
              if (typeof closeRef === "function") {
                closeRef(element);
              } else if (closeRef) {
                closeRef.current = element;
              }
            }}
            variant="quiet"
            size="icon"
            class="flex-none text-muted"
            aria-label={sheet ? "Back to the collection" : "Close details"}
            title={sheet ? "Back to the collection" : "Close details"}
            data-inspector-close
            onClick={onClose}
          >
            {sheet ? <BackIcon /> : <CloseIcon />}
          </Button>
        }
        end={
          <div role="group" aria-label="Previous and next" class="flex flex-none">
            {stepButton("previous")}
            {stepButton("next")}
          </div>
        }
      />
      <div
        ref={body}
        class="grid min-h-0 flex-1 content-start gap-5 overflow-x-hidden overflow-y-auto px-4 pt-3.5 pb-7"
        data-inspector-body
      >
        <AssetFrame
          key={`${asset.path}\n${asset.src ?? ""}`}
          asset={asset}
          pixels={pixels}
          read={(path) => intents().then((Workspace) => Workspace.assets.readText(path))}
          onSeconds={setVideoSeconds}
        />
        {problems.length > 0 && (
          <Section title="Problems" aside={String(problems.length)} label="Problems">
            <div>
              {problems.map((problem, index) => (
                <MessageEntry
                  key={index}
                  severity={severityOf(problem.severity)}
                  title={messageOf(problem)}
                />
              ))}
            </div>
          </Section>
        )}
        <Section title="Details" label="Details">
          <DetailList rows={rows} />
        </Section>
        <Section
          title={!uses ? "Uses" : lines ? `Used in ${plural(lines, "line")}` : "Not used yet"}
          label="Uses"
        >
          {uses === undefined ? (
            <p class="m-0 text-[12px]/[1.5] text-muted">Looking for uses…</p>
          ) : uses === null ? (
            <p class="m-0 text-[12px]/[1.5] text-muted" data-uses-failed>
              Where it is used could not be looked up. Edit a script to try again.
            </p>
          ) : lines ? (
            <div class="-mx-2 -mt-2.5">
              <UsesList
                groups={uses}
                onOpen={(use) =>
                  void intents().then((Workspace) => Workspace.window.revealDocument(use.uri, use.range))
                }
              />
            </div>
          ) : (
            <p class="m-0 text-[12px]/[1.5] text-muted">{NOT_USED_NOTES[asset.type]}</p>
          )}
        </Section>
        {!asset.link && (
          <div class="flex flex-wrap gap-2">
            <Button variant="quiet" data-inspector-replace onClick={() => picker.current?.click()}>
              <ReplaceSwapIcon />
              Replace…
            </Button>
            <Button
              variant="quiet"
              data-inspector-download
              onClick={() =>
                void intents()
                  .then((Workspace) => Workspace.assets.download(asset.path))
                  .catch((error: unknown) =>
                    showSnackbar({ message: error instanceof Error ? error.message : String(error) }),
                  )
              }
            >
              <DownloadIcon />
              Download
            </Button>
            <input ref={picker} type="file" class="hidden" data-inspector-picker onChange={onPicked} />
          </div>
        )}
      </div>
    </section>
  );
}
