import {
  BackIcon,
  BookIcon,
  Button,
  ChevronIcon,
  CloseIcon,
  DropdownContent,
  DropdownItem,
  DropdownRoot,
  DropdownTrigger,
  FileIcon,
  FolderIcon,
  ListRow,
  PinIcon,
  PlusIcon,
  RootIcon,
  SearchIcon,
  VirtualList,
} from "@impower/impower-ui/components";
import { useComputed } from "@preact/signals";
import { Fragment } from "preact";
import { useEffect, useState } from "preact/hooks";
import { plural, rowLine } from "../../utils/fileListModel";
import { showSnackbar } from "../../utils/snackbar";
import {
  browseParent,
  crumbsOf,
  MAIN_SCRIPT,
  scriptFolders,
  scriptRows,
  scriptsHome,
  type ScriptListing,
  type ScriptRow,
} from "../../workspace/scriptsListing";
import workspace from "../../workspace/WorkspaceStore";
import MoveDialog from "./MoveDialog";
import NameRow from "./NameRow";
import RowMenu, { type RowAction } from "./RowMenu";
import SortMenu from "./SortMenu";

const EMPTY: ScriptListing = { files: {}, folders: [] };

const intents = async () => (await import("../../workspace/Workspace")).Workspace;

const run = async (action: () => Promise<unknown>) => {
  try {
    await action();
  } catch (e) {
    showSnackbar({ message: e instanceof Error ? e.message : String(e) });
  }
};

const usesLabel = (count: number) => `Referenced by ${plural(count, "script")}`;

const stemAndExtension = (name: string) => {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
};

function RowIcon({ row }: { row: ScriptRow }) {
  if (row.kind === "folder") return <FolderIcon />;
  if (row.pinned) return <PinIcon />;
  return <FileIcon />;
}

function Trail({
  folder,
  home,
  count,
  onOpen,
}: {
  folder: string;
  home: string;
  count: number;
  onOpen: (folder: string) => void;
}) {
  if (!folder) {
    return (
      <nav aria-label="Folder path" class="flex min-w-0 items-center gap-0.5 text-[12px]">
        <span class="flex flex-none items-center px-2 text-muted [&_svg]:size-[17px]">
          <RootIcon />
        </span>
        <span aria-current="location" class="min-w-0 pr-3.5 pl-2 font-medium [--fade:14px] fade-edge">
          {plural(count, "script")}
        </span>
      </nav>
    );
  }
  const crumbs = crumbsOf(folder, home);
  return (
    <nav aria-label="Folder path" class="flex min-w-0 items-center gap-0.5 overflow-x-clip text-[12px] [&>svg]:size-3 [&>svg]:flex-none [&>svg]:text-muted">
      <Button
        variant="quiet"
        size="icon"
        aria-label="Parent folder"
        class="flex-none text-muted"
        onClick={() => onOpen(browseParent(folder, home))}
      >
        <BackIcon />
      </Button>
      <Button
        variant="quiet"
        size="icon"
        aria-label="Scripts"
        class="flex-none text-muted"
        onClick={() => onOpen("")}
      >
        <RootIcon />
      </Button>
      {crumbs.map((crumb, i) =>
        i === crumbs.length - 1 ? (
          <Fragment key={crumb.path}>
            <ChevronIcon />
            <span
              aria-current="location"
              class="min-w-7 pr-3.5 pl-2 font-medium [--fade:14px] fade-edge"
            >
              {crumb.name}
            </span>
          </Fragment>
        ) : (
          <Fragment key={crumb.path}>
            <ChevronIcon />
            <Button
              variant="quiet"
              size="compact"
              class="max-w-40 text-muted [--fade:14px] fade-edge"
              onClick={() => onOpen(crumb.path)}
            >
              {crumb.name}
            </Button>
          </Fragment>
        ),
      )}
    </nav>
  );
}

export default function ScriptsPage() {
  const projectId = workspace.signals.projectId.value;
  const loaded = workspace.scriptListing.value;
  const listing = loaded ?? EMPTY;
  const references = workspace.scriptReferences.value;
  const lists = useComputed(() => workspace.state.value.lists).value;
  const openScript = useComputed(() => {
    const logic = workspace.state.value.panes.logic;
    const editor = logic.panels.scripts?.activeEditor;
    return logic.panel === "scripts" && editor?.open && editor.filename
      ? editor.filename
      : MAIN_SCRIPT;
  }).value;
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState<"script" | "folder" | null>(null);
  const [fromMenu, setFromMenu] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);

  useEffect(() => {
    let dispose: (() => void) | undefined;
    let cancelled = false;
    void intents().then((Workspace) => {
      if (!cancelled) {
        dispose = Workspace.scripts.watch();
      }
    });
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [projectId]);

  const home = scriptsHome(listing);
  const saved = lists?.scriptsFolder ?? "";
  const folder = scriptFolders(listing).includes(saved) ? saved : "";
  const sort = lists?.scriptsSort;
  const rows = scriptRows({ listing, references, folder, query, sort });

  const openFolder = (next: string) => {
    setQuery("");
    void intents().then((Workspace) =>
      Workspace.window.setListState({ scriptsFolder: next }),
    );
  };

  const onAction = (row: ScriptRow, action: RowAction) => {
    if (action === "rename") setRenaming(row.path);
    else if (action === "move") setMoving(row.path);
    else
      void run(async () => {
        const { scripts } = await intents();
        if (action === "duplicate") await scripts.duplicate(row.path);
        else if (action === "download") await scripts.download(row.path);
        else await scripts.remove(row.path);
      });
  };

  const renderRow = (row: ScriptRow) => {
    if (renaming === row.path) {
      const [stem, extension] =
        row.kind === "file" ? stemAndExtension(row.name) : [row.name, ""];
      return (
        <NameRow
          icon={<RowIcon row={row} />}
          label={`Rename ${row.name}`}
          refocusOnce
          initial={stem}
          suffix={extension}
          onCancel={() => setRenaming(null)}
          onCommit={async (name) => {
            await (await intents()).scripts.rename(row.path, name);
            setRenaming(null);
          }}
        />
      );
    }
    const line = rowLine({
      entry: row,
      sort,
      entryLabel: "Entry script",
      location: row.location,
      holdings: row.holdings,
      usesLabel,
    });
    return (
      <ListRow
        current={row.kind === "file" && row.path === openScript}
        icon={<RowIcon row={row} />}
        label={row.name}
        description={line}
        aria-label={`${row.kind === "folder" ? "Open folder" : "Open script"} ${row.name}${line ? `, ${line.toLowerCase()}` : ""}`}
        trailing={row.kind === "folder" ? <ChevronIcon /> : undefined}
        actions={
          <RowMenu
            name={row.name}
            kind={row.kind}
            main={!!row.pinned}
            onAction={(action) => onAction(row, action)}
          />
        }
        onClick={() => {
          if (row.kind === "folder") openFolder(row.path);
          else void intents().then((Workspace) => Workspace.window.openScript(row.path));
        }}
      />
    );
  };

  return (
    <section aria-label="Scripts" class="flex min-h-0 flex-1 flex-col bg-bg [:root[data-layout=desktop]_&]:bg-paper">
      <header class="flex h-12 flex-none items-center gap-2.5 border-b border-edge px-4 [:root[data-layout=desktop]_&]:h-[68px] [:root[data-layout=desktop]_&]:px-[18px]">
        <BookIcon class="size-5 flex-none text-accent" />
        <h1 class="min-w-0 flex-1 text-[14px] font-semibold [:root[data-layout=desktop]_&]:text-[17px]">
          Scripts
        </h1>
        <Button
          variant="quiet"
          size="compact"
          class="text-accent"
          onClick={() => void intents().then((Workspace) => Workspace.window.navigateTo("write"))}
        >
          <BackIcon />
          Back to story
        </Button>
      </header>
      <div class="@container flex min-h-0 flex-1 flex-col px-4 [:root[data-layout=desktop]_&]:px-[18px]">
        <div class="mx-auto flex min-h-0 w-full max-w-[960px] flex-1 flex-col">
          <div class="flex flex-none items-center gap-2.5 pt-4 pb-2">
            <label class="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-control border border-edge pl-3 focus-within:border-accent">
              <SearchIcon class="size-[18px] flex-none text-muted" />
              <input
                type="search"
                aria-label="Search scripts"
                placeholder="Search scripts"
                autocomplete="off"
                spellcheck={false}
                value={query}
                class="h-full min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-muted [:root[data-layout=desktop]_&]:text-[13px] [&::-webkit-search-cancel-button]:hidden"
                onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape" && query) {
                    e.preventDefault();
                    setQuery("");
                  }
                }}
              />
              {query && (
                <Button variant="quiet" size="icon" aria-label="Clear search" class="text-muted" onClick={() => setQuery("")}>
                  <CloseIcon />
                </Button>
              )}
            </label>
            <DropdownRoot>
              <DropdownTrigger asChild>
                <Button class="bg-transparent text-accent">
                  <PlusIcon />
                  New
                </Button>
              </DropdownTrigger>
              <DropdownContent align="end" class="min-w-[196px]">
                <DropdownItem onSelect={() => { setQuery(""); setFromMenu(true); setCreating("script"); }}>
                  <FileIcon class="text-muted" />
                  Script
                </DropdownItem>
                <DropdownItem onSelect={() => { setQuery(""); setFromMenu(true); setCreating("folder"); }}>
                  <FolderIcon class="text-muted" />
                  Folder
                </DropdownItem>
              </DropdownContent>
            </DropdownRoot>
          </div>
          <div class="flex min-h-[52px] flex-none items-center justify-between gap-2 border-b border-edge">
            {query.trim() ? (
              <span class="pl-2 text-[12px] text-muted">Results in all folders</span>
            ) : (
              <Trail
                folder={folder}
                home={home}
                count={Object.keys(listing.files).length}
                onOpen={openFolder}
              />
            )}
            <SortMenu
              value={sort}
              onChange={(key) =>
                void intents().then((Workspace) => Workspace.window.setListState({ scriptsSort: key }))
              }
            />
          </div>
          {creating && (
            <div class="flex-none pt-2">
              <NameRow
                icon={creating === "script" ? <FileIcon /> : <FolderIcon />}
                label={creating === "script" ? "New script name" : "New folder name"}
                refocusOnce={fromMenu}
                suffix={creating === "script" ? ".sd" : undefined}
                onCancel={() => setCreating(null)}
                onCommit={async (name) => {
                  const { scripts, window } = await intents();
                  const path = await scripts.create(creating, folder, name);
                  setCreating(null);
                  if (creating === "folder") openFolder(path);
                  else window.openScript(path);
                }}
              />
            </div>
          )}
          {rows.length ? (
            <VirtualList
              label={query.trim() ? "Search results" : "Scripts and folders"}
              class="-mr-4 flex-1 pt-2 pr-4 pb-5"
              items={rows}
              getKey={(row) => row.path}
              renderItem={renderRow}
            />
          ) : !loaded ? null : (
            <div class="flex flex-col items-center gap-3 px-5 py-14 text-center text-muted">
              {query.trim() ? <SearchIcon class="size-8" /> : <FolderIcon class="size-8" />}
              <h2 class="text-[16px] font-medium text-ink">
                {query.trim() ? "No scripts match." : "This folder is empty"}
              </h2>
              {query.trim() ? (
                <Button variant="quiet" onClick={() => setQuery("")}>Clear search</Button>
              ) : (
                <Button onClick={() => { setFromMenu(false); setCreating("script"); }}>
                  <PlusIcon />
                  New script
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
      <MoveDialog
        path={moving}
        listing={listing}
        onClose={() => setMoving(null)}
        onMove={async (path, target) => {
          await (await intents()).scripts.move(path, target);
        }}
        onCreateFolder={(parent, name) =>
          intents().then((Workspace) => Workspace.scripts.create("folder", parent, name))
        }
      />
    </section>
  );
}

