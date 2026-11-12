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
  OpenIcon,
  PanelHead,
  panelHeadTitleVariants,
  ReplaceSwapIcon,
  SaveIcon,
  TextField,
  useEscapeWithin,
} from "@impower/impower-ui/components";
import { useLayout } from "@impower/impower-ui/layout";
import type { Ref } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { addMenuFolders, addMenuKindsOf } from "../../utils/addMenuFolders";
import {
  assetDetails,
  NOT_USED_NOTES,
  titleLine,
  type InspectedAsset,
} from "../../utils/assetDetails";
import { plural } from "../../utils/fileListModel";
import { reasonOf, type FileMove } from "../../utils/fileMoves";
import { imageStacks, isStacked } from "../../utils/imageStacks";
import { defaultForm, variantOf, type VariantForm, type VariantSelection } from "../../utils/imageVariants";
import { showSnackbar } from "../../utils/snackbar";
import { assetsHome } from "../../workspace/assetsListing";
import type { Workspace as WorkspaceIntents } from "../../workspace/Workspace";
import type { InspectorFacts } from "../../workspace/WorkspaceAssets";
import { useSettings } from "../../workspace/settings/useSettings";
import { audioSession } from "../../workspace/editorAudio";
import { AUDITION_OWNER } from "../../workspace/WorkspaceAudition";
import workspace from "../../workspace/WorkspaceStore";
import { UsesList } from "../find-references-rename";
import AssetFrame from "./AssetFrame";
import type { InspectorHost } from "./dock";
import FilesSection from "./FilesSection";
import Section from "./Section";
import VariantsSection from "./VariantsSection";

export type InspectorNeighbor = { path: string; name: string };

export type AssetInspectorProps = {
  asset: InspectedAsset;
  previous: InspectorNeighbor | null;
  next: InspectorNeighbor | null;
  host: InspectorHost;
  intents: () => Promise<typeof WorkspaceIntents>;
  relocate: (paths: readonly string[], action: () => Promise<readonly FileMove[]>) => Promise<void>;
  onStep: (path: string) => void;
  onClose: () => void;
  closeRef?: Ref<HTMLButtonElement>;
};

const EMPTY_LISTING = { files: {}, folders: [] };

const SKIPS_ARROWS = "input, textarea, select, video, audio, [contenteditable], [role=slider]";

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

const OPENABLE = /^https?:\/\//i;

function LinkAddress({
  asset,
  intents,
}: {
  asset: InspectedAsset;
  intents: () => Promise<typeof WorkspaceIntents>;
}) {
  const saved = asset.address ?? "";
  const [draft, setDraft] = useState(saved);
  const changed = !!draft.trim() && draft.trim() !== saved;
  const save = () => {
    if (!changed) {
      return;
    }
    void intents()
      .then((Workspace) => Workspace.assets.setAddress(asset.path, draft))
      .then(
        () => showSnackbar({ message: "Address saved." }),
        (error: unknown) => showSnackbar({ message: reasonOf(error) }),
      );
  };
  return (
    <Section title="Address" label="Address">
      <div class="flex flex-col gap-2">
        <TextField
          type="url"
          width="full"
          aria-label="Address"
          placeholder="https://"
          autocomplete="off"
          spellcheck={false}
          value={draft}
          onValueChange={setDraft}
          onKeyDown={(event: KeyboardEvent) => {
            if (event.key === "Enter") {
              event.preventDefault();
              save();
            }
          }}
        />
        <div class="flex flex-wrap gap-2">
          <Button variant="quiet" data-inspector-save-address disabled={!changed} onClick={save}>
            <SaveIcon />
            Save address
          </Button>
          {OPENABLE.test(saved) && (
            <Button asChild variant="quiet">
              <a href={saved} target="_blank" rel="noreferrer noopener" data-inspector-open-link>
                <OpenIcon />
                Open link
              </a>
            </Button>
          )}
        </div>
      </div>
    </Section>
  );
}

const messageOf =(problem: NonNullable<InspectorFacts["problems"]>[number]) =>
  typeof problem.message === "string" ? problem.message : problem.message.value;

const severityOf = (severity: number | undefined) =>
  severity === 1 ? "error" : severity === 2 ? "warning" : "info";

export default function AssetInspector({
  asset,
  previous,
  next,
  host,
  intents,
  relocate,
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
  const lastFocused = useRef<HTMLElement | null>(null);
  const body = useRef<HTMLDivElement | null>(null);
  const region = useRef<HTMLElement | null>(null);
  const picker = useRef<HTMLInputElement | null>(null);
  const [facts, setFacts] = useState<InspectorFacts | null>(null);
  const [videoSeconds, setVideoSeconds] = useState<number | null>(null);
  const audioSeconds = useAudioSeconds(asset);
  const { projectSettings } = useSettings();
  const pixels = asset.src ? workspace.assetSizes.value[asset.src] : undefined;
  const filesKey = asset.files.map((file) => `${file.path} ${file.src ?? ""}`).join("\n");
  const stack = useMemo(() => {
    const [only] = asset.type === "image" && !asset.link ? imageStacks(asset.files.map((file) => file.path)) : [];
    return only && isStacked(only) ? only : null;
  }, [filesKey, asset.type, asset.link]);
  const [selection, setSelection] = useState<VariantSelection>({});
  const [previewing, setPreviewing] = useState<VariantSelection | null>(null);
  const [chosenForm, setChosenForm] = useState<VariantForm | null>(null);
  const [picture, setPicture] = useState<string | null | undefined>(undefined);
  const variant = stack ? variantOf(stack, previewing ?? selection) : null;
  const variantKey = variant ? JSON.stringify(variant) : "";

  const playback = audioSession.playback.value;
  const sounding =
    !!playback && playback.owner !== AUDITION_OWNER && (playback.status === "playing" || playback.status === "loading");
  useEscapeWithin(region, sounding, () => audioSession.stop());

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
    setSelection({});
    setPreviewing(null);
    setChosenForm(null);
    setPicture(undefined);
  }, [asset.path]);

  useEffect(() => {
    if (!variant) {
      return;
    }
    let dispose: (() => void) | undefined;
    let alive = true;
    void intents().then((Workspace) => {
      if (alive) {
        dispose = Workspace.assets.watchPicture(stack!.cover, variant, setPicture);
      }
    });
    return () => {
      alive = false;
      dispose?.();
    };
  }, [variantKey, filesKey]);

  useEffect(() => {
    if (asset.type === "image" && asset.src && pixels === undefined) {
      void intents().then((Workspace) => Workspace.assets.measureImages([asset.path]));
    }
  }, [asset.path, asset.src]);

  useEffect(() => {
    const element = region.current;
    if (!element || typeof MutationObserver === "undefined") {
      return;
    }
    const restore = () => {
      const last = lastFocused.current;
      const active = document.activeElement;
      if (!last || last.isConnected || (active && active !== document.body)) {
        return;
      }
      const sameKind = last.matches("[data-zoom-frame]")
        ? "[data-zoom-frame][tabindex]"
        : last.matches("[data-text-contents]")
          ? "[data-text-contents]"
          : last.matches("video")
            ? "video"
            : null;
      ((sameKind ? body.current?.querySelector<HTMLElement>(sameKind) : null) ?? close.current)?.focus({
        preventScroll: true,
      });
    };
    const observer = new MutationObserver(restore);
    observer.observe(element, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const direction = stepped.current;
    stepped.current = null;
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
        showSnackbar({ message: reasonOf(error) }),
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
  const form =
    chosenForm ??
    defaultForm({
      kinds: stack ? addMenuKindsOf({ path: stack.cover, type: "image" }, addMenuFolders(projectSettings)) : [],
      lines: (uses ?? []).flatMap((group) => group.uses.map((use) => use.lineText)),
      pixels,
    });
  const lines = uses?.reduce((sum, group) => sum + group.uses.length, 0) ?? 0;
  const problems = facts ? facts.problems : [];

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
      ref={region}
      aria-label="Asset details"
      data-asset-inspector={host}
      class={
        sheet
          ? "relative flex h-full min-h-0 flex-col bg-panel text-ink"
          : "relative flex h-full min-h-0 flex-col bg-preview-mat text-ink"
      }
      onKeyDown={onKeyDown}
      onFocusIn={(event) => {
        lastFocused.current = event.target instanceof HTMLElement ? event.target : null;
      }}
    >
      <PanelHead
        size={desktop && !sheet ? "tall" : "default"}
        titleSize="sm"
        class="px-2"
        title={
          sheet ? (
            <DialogTitle class={panelHeadTitleVariants({ titleSize: "sm" })}>{asset.name}</DialogTitle>
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
        class="grid min-h-0 flex-1 auto-rows-max content-start gap-5 overflow-x-hidden overflow-y-auto px-4 pt-3.5 pb-7"
        data-inspector-body
      >
        <AssetFrame
          key={`${asset.path}\n${asset.src ?? ""}`}
          asset={asset}
          picture={stack ? picture : undefined}
          pixels={pixels}
          read={(path) => intents().then((Workspace) => Workspace.assets.readText(path))}
          onSeconds={setVideoSeconds}
        />
        {stack && (
          <VariantsSection
            stack={stack}
            selection={selection}
            form={form}
            onSelect={setSelection}
            onPreview={setPreviewing}
            onForm={setChosenForm}
            sheetContainer={region}
          />
        )}
        {asset.link && <LinkAddress key={`${asset.path}\n${asset.address ?? ""}`} asset={asset} intents={intents} />}
        {problems === null ? (
          <Section title="Problems" label="Problems">
            <p class="m-0 text-[12px]/[1.5] text-muted" data-problems-failed>
              Its problems could not be checked. Edit a script to try again.
            </p>
          </Section>
        ) : problems.length > 0 && (
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
        {stack && stack.paths.length > 1 && (
          <FilesSection
            stack={stack}
            sizes={Object.fromEntries(asset.files.map((file) => [file.path, file.size]))}
            intents={intents}
            relocate={relocate}
          />
        )}
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
        <div class="flex flex-wrap gap-2">
          {!asset.link && (
            <Button variant="quiet" data-inspector-replace onClick={() => picker.current?.click()}>
              <ReplaceSwapIcon />
              Replace…
            </Button>
          )}
          <Button
              variant="quiet"
              data-inspector-download
              onClick={() =>
                void intents()
                  .then((Workspace) => Workspace.assets.downloadAll([asset.path]))
                  .catch((error: unknown) =>
                    showSnackbar({ message: reasonOf(error) }),
                  )
              }
            >
              <DownloadIcon />
              Download
            </Button>
          {!asset.link && (
            <input ref={picker} type="file" class="hidden" data-inspector-picker onChange={onPicked} />
          )}
        </div>
      </div>
    </section>
  );
}
