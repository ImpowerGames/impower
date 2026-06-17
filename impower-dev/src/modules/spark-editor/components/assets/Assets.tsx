import {
  Button,
  Files,
  Link,
  Plus,
  Router,
  Tab,
  Tabs,
  Upload,
} from "@impower/impower-ui/components";
import { useComputed } from "@preact/signals";
import { startTransition } from "preact/compat";
import { useRef, useState } from "preact/hooks";
import getUniqueFileName from "../../utils/getUniqueFileName";
import getValidFileName from "../../utils/getValidFileName";
import workspace from "../../workspace/WorkspaceStore";
import FileList from "../file-list/FileList";
import FileListBorder from "../file-list/FileListBorder";

export const propDefaults = {};
export type AssetsProps = Partial<typeof propDefaults>;

type Panel = "files" | "urls";

/**
 * Assets pane wrapper. Top sub-tabs switch between Files and URLs panels.
 *
 * The Router uses `mode="slide-x"` (a horizontal swipe matching sparkle's
 * `<s-router directional>`). The FAB inside each FileList is tagged with
 * `viewTransitionName="assets-fab"` — that opts it OUT of the root slide
 * snapshot and into its own shared-element animation group, so visually
 * the FAB stays anchored at the bottom while the rest of the panel
 * (sub-tabs, list, empty state) slides past it.
 */
export default function Assets(_props: AssetsProps) {
  const panel = (workspace.state.value.panes?.assets?.panel ||
    "files") as Panel;

  // Collapse the FAB to an icon once the active list is scrolled off the top.
  const [fabCollapsed, setFabCollapsed] = useState(false);

  const onPanelChange = (next: string) => {
    startTransition(() => {
      void import("../../workspace/Workspace").then(({ Workspace }) => {
        Workspace.window.openPanel("assets", next);
      });
    });
  };

  return (
    <>
      <div class="sticky top-0 z-10 flex-none bg-engine-900">
        <Tabs
          value={panel}
          onChange={onPanelChange}
          indicator="underline"
          iconLayout="beside"
        >
          <Tab value="files" icon={Files}>
            Files
          </Tab>
          <Tab value="urls" icon={Link}>
            URLs
          </Tab>
        </Tabs>
      </div>
      <div class="relative flex-1 min-h-0">
        <Router active={panel} mode="slide-x">
          <FileList
            key="files"
            exclude="*.{sd,metadata,name,textSynced,textRevisionId,zipSynced,zipRevisionId}"
            onScrolledChange={setFabCollapsed}
            emptyState={
              <FileListBorder>
                <Files class="size-12 m-2" />
                <span class="text-sm">No Files</span>
              </FileListBorder>
            }
          />
          <FileList
            key="urls"
            include="*.{url}"
            onScrolledChange={setFabCollapsed}
            emptyState={
              <FileListBorder>
                <Link class="size-12 m-2" />
                <span class="text-sm">No URLs</span>
              </FileListBorder>
            }
          />
        </Router>
        {/* FAB stays anchored at the bottom — pulled out of the
            sliding Router so it doesn't move with the panel content.
            Single Button shell, inner icon+label cross-fade between
            Files's "Upload Files" and URLs's "Add URL". The shell
            stays at 100% opacity so there's no compositing-induced
            brightness dip during the cross-fade. */}
        <div class="pointer-events-none absolute inset-x-0 bottom-0 h-24 [&_button]:pointer-events-auto">
          <AssetsFab panel={panel} collapsed={fabCollapsed} />
        </div>
      </div>
    </>
  );
}

function AssetsFab({
  panel,
  collapsed,
}: {
  panel: Panel;
  collapsed: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const disabledSig = useComputed(() => {
    const status = workspace.signals.syncStatus.value;
    return (
      status === "syncing" ||
      status === "loading" ||
      status === "importing" ||
      status === "exporting"
    );
  });

  async function uploadFiles(e: Event) {
    const input = e.target as HTMLInputElement;
    const fileList = input.files;
    if (!fileList) return;
    const projectId = workspace.signals.projectId.value;
    if (!projectId) return;
    const { Workspace } = await import("../../workspace/Workspace");
    const files = await Promise.all(
      Array.from(fileList).map(async (file) => ({
        uri: Workspace.fs.getFileUri(projectId, getValidFileName(file.name)),
        data: await file.arrayBuffer(),
      })),
    );
    await Workspace.fs.createFiles({ files });
    await Workspace.window.recordAssetChange();
    input.value = "";
  }

  async function addUrl() {
    const projectId = workspace.signals.projectId.value;
    if (!projectId) return;
    const { Workspace } = await import("../../workspace/Workspace");
    const files = await Workspace.fs.getFiles(projectId);
    const filenames = Object.keys(files).map((uri) =>
      Workspace.fs.getFilename(uri),
    );
    const uniqueFilename = getUniqueFileName(filenames, "asset00.url");
    await Workspace.fs.createFiles({
      files: [
        {
          uri: Workspace.fs.getFileUri(projectId, uniqueFilename),
          data: new ArrayBuffer(0),
        },
      ],
    });
    await Workspace.window.recordAssetChange();
  }

  const onClick = panel === "files" ? () => inputRef.current?.click() : addUrl;

  // Collapsed: shrink to a 48px circle docked right, icon-only. The two
  // crossfading label overlays keep their icon but collapse their text width
  // to 0 so the icon stays centered (matching FileAddButton/FileUploadButton).
  const labelClass = `overflow-hidden whitespace-nowrap transition-[max-width,opacity,margin] duration-200 ease-out ${
    collapsed ? "ml-0 max-w-0 opacity-0" : "ml-2 max-w-[12rem] opacity-100"
  }`;
  return (
    <div class="mx-4 my-6 flex flex-col">
      <Button
        variant="fab"
        disabled={disabledSig.value}
        onClick={onClick}
        class={`ml-auto h-12 overflow-hidden rounded-full text-base font-normal transition-[width,padding] duration-200 ease-out ${
          collapsed ? "w-12 px-0" : "w-full px-5"
        }`}
      >
        <span
          class={`absolute inset-0 flex flex-row items-center justify-center gap-0 transition-opacity duration-200 ${
            panel === "files" ? "opacity-100 delay-150" : "opacity-0"
          }`}
        >
          <Upload class="size-5 shrink-0" />
          <span class={labelClass}>Upload Files</span>
        </span>
        <span
          class={`absolute inset-0 flex flex-row items-center justify-center gap-0 transition-opacity duration-200 ${
            panel === "urls" ? "opacity-100 delay-150" : "opacity-0"
          }`}
        >
          <Plus class="size-5 shrink-0" />
          <span class={labelClass}>Add URL</span>
        </span>
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*, audio/*, video/*, .txt"
        multiple
        class="hidden"
        onChange={uploadFiles}
      />
    </div>
  );
}
