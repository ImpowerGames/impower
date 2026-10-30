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
import { recordCreate } from "../../utils/fileUndo";
import getUniqueFileName from "../../utils/getUniqueFileName";
import getValidFileName from "../../utils/getValidFileName";
import { importDroppedFiles } from "../../utils/importDroppedFiles";
import workspace from "../../workspace/WorkspaceStore";
import FileList from "../file-list/FileList";
import FileListBorder from "../file-list/FileListBorder";
import AddUrlDialog from "./AddUrlDialog";
import type { PanelType } from "@impower/spark-editor-protocol/src/types";

export const propDefaults = {};
export type AssetsProps = Partial<typeof propDefaults>;

type Panel = "files" | "urls";

const URLS_DIR = "assets/urls";
const FILES_EXCLUDE_DIRS = [URLS_DIR];

export default function Assets(_props: AssetsProps) {
  const panel = (workspace.state.value.panes?.assets?.panel ||
    "files") as Panel;

  const [fabCollapsed, setFabCollapsed] = useState(false);
  const [filesScope, setFilesScope] = useState("assets");
  const [urlsScope, setUrlsScope] = useState("assets/urls");

  const onPanelChange = (next: string) => {
    startTransition(() => {
      void import("../../workspace/Workspace").then(({ Workspace }) => {
        Workspace.window.openPanel("assets", next as PanelType);
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
            rootDir="assets"
            enablePreview
            exclude="*.{sd,url,metadata,name,textSynced,textRevisionId,zipSynced,zipRevisionId}"
            excludeDirs={FILES_EXCLUDE_DIRS}
            onScrolledChange={setFabCollapsed}
            onScopeChange={setFilesScope}
            emptyState={
              <FileListBorder>
                <Files class="size-12 m-2" />
                <span class="text-sm">No Files</span>
              </FileListBorder>
            }
          />
          <FileList
            key="urls"
            rootDir={URLS_DIR}
            enablePreview
            onScrolledChange={setFabCollapsed}
            onScopeChange={setUrlsScope}
            emptyState={
              <FileListBorder>
                <Link class="size-12 m-2" />
                <span class="text-sm">No URLs</span>
              </FileListBorder>
            }
          />
        </Router>

        <div class="pointer-events-none absolute inset-x-0 bottom-0 h-24 [&_button]:pointer-events-auto">
          <AssetsFab
            panel={panel}
            collapsed={fabCollapsed}
            scope={panel === "files" ? filesScope : urlsScope}
          />
        </div>
      </div>
    </>
  );
}

function AssetsFab({
  panel,
  collapsed,
  scope,
}: {
  panel: Panel;
  collapsed: boolean;
  scope: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [urlDialogOpen, setUrlDialogOpen] = useState(false);
  const disabledSig = useComputed(() => {
    const status = workspace.signals.syncStatus.value;
    return (
      (panel === "files" && workspace.importProgress.value != null) ||
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
    const fileArr = Array.from(fileList);
    input.value = "";
    await importDroppedFiles(
      projectId,
      fileArr.map((file) => {
        const name = getValidFileName(file.name);
        return {
          rel: scope ? `${scope}/${name}` : name,
          getBuffer: () => file.arrayBuffer(),
        };
      }),
    );
  }

  async function createUrlAsset(url: string, name: string) {
    const projectId = workspace.signals.projectId.value;
    if (!projectId) return;
    const { Workspace } = await import("../../workspace/Workspace");
    const files = await Workspace.fs.getFiles(projectId);
    const filenames = Object.keys(files).map((uri) =>
      Workspace.fs.getFilename(uri),
    );
    const base = getValidFileName(name) || "asset";
    const uniqueFilename = getUniqueFileName(filenames, `${base}.url`);
    const rel = scope ? `${scope}/${uniqueFilename}` : uniqueFilename;
    const uri = Workspace.fs.getFileUri(projectId, rel);
    await Workspace.fs.createFiles({
      files: [
        {
          uri,
          data: new TextEncoder().encode(url).buffer,
        },
      ],
    });
    await Workspace.window.recordAssetChange();
    recordCreate(projectId, [uri], uniqueFilename);
  }

  const onClick =
    panel === "files"
      ? () => inputRef.current?.click()
      : () => setUrlDialogOpen(true);

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
      <AddUrlDialog
        open={urlDialogOpen}
        onClose={() => setUrlDialogOpen(false)}
        onSubmit={createUrlAsset}
      />
    </div>
  );
}
