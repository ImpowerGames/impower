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
import { useRef } from "preact/hooks";
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

  const onPanelChange = (next: string) => {
    startTransition(() => {
      void import("../../workspace/Workspace").then(({ Workspace }) => {
        Workspace.window.openedPanel("assets", next);
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
          <AssetsFab panel={panel} />
        </div>
      </div>
    </>
  );
}

function AssetsFab({ panel }: { panel: Panel }) {
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

  return (
    <div class="mx-4 my-6 flex justify-center">
      <Button
        variant="fab"
        size="fab"
        disabled={disabledSig.value}
        onClick={onClick}
      >
        <span
          class={`absolute inset-0 flex flex-row items-center justify-center gap-2 transition-opacity duration-200 ${
            panel === "files" ? "opacity-100 delay-150" : "opacity-0"
          }`}
        >
          <Upload class="size-5" />
          Upload Files
        </span>
        <span
          class={`absolute inset-0 flex flex-row items-center justify-center gap-2 transition-opacity duration-200 ${
            panel === "urls" ? "opacity-100 delay-150" : "opacity-0"
          }`}
        >
          <Plus class="size-5" />
          Add URL
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
