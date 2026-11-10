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
  TextField,
  TrashIcon,
  VirtualList,
} from "@impower/impower-ui/components";
import { useComputed } from "@preact/signals";
import { Fragment } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
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
import selection from "../../workspace/scriptsSelection";
import workspace from "../../workspace/WorkspaceStore";
import DeleteDialog from "./DeleteDialog";
import MoveDialog from "./MoveDialog";
import NameRow from "./NameRow";
import RowMenu, { type RowAction } from "./RowMenu";
import SelectionBar, { type SelectionAction } from "./SelectionBar";
import SortMenu from "./SortMenu";
import { DROP_FOLDER, useScriptsDrag } from "./useScriptsDrag";

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

const DROP_HIGHLIGHT = "bg-tint text-accent ring-2 ring-inset ring-accent";

function Trail({
  folder,
  home,
  count,
  dropTarget,
  onOpen,
}: {
  folder: string;
  home: string;
  count: number;
  dropTarget: string | null;
  onOpen: (folder: string) => void;
}) {
  const dropAt = (target: string) => ({ [DROP_FOLDER]: target });
  if (!folder) {
    return (
      <nav aria-label="Folder path" class="flex min-w-0 items-center gap-0.5 text-[12px]">
        <DropdownRoot>
          <DropdownTrigger asChild>
            <Button variant="quiet" size="icon" aria-label="Scripts options" class="flex-none text-muted [&_svg]:size-[17px]">
              <RootIcon />
            </Button>
          </DropdownTrigger>
          <DropdownContent align="start" class="min-w-[196px]">
            <DropdownItem onSelect={() => void intents().then((Workspace) => Workspace.window.openTrash())}>
              <TrashIcon class="text-muted" />
              Recycle bin
            </DropdownItem>
          </DropdownContent>
        </DropdownRoot>
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
        {...dropAt(browseParent(folder, home))}
        class={dropTarget === browseParent(folder, home) ? `flex-none text-muted ${DROP_HIGHLIGHT}` : "flex-none text-muted"}
        onClick={() => onOpen(browseParent(folder, home))}
      >
        <BackIcon />
      </Button>
      <Button
        variant="quiet"
        size="icon"
        aria-label="Scripts"
        {...dropAt("")}
        class={dropTarget === "" ? `flex-none text-muted ${DROP_HIGHLIGHT}` : "flex-none text-muted"}
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
              {...dropAt(crumb.path)}
              class={dropTarget === crumb.path ? `max-w-40 text-muted [--fade:14px] fade-edge ${DROP_HIGHLIGHT}` : "max-w-40 text-muted [--fade:14px] fade-edge"}
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
  const current = workspace.scriptListing.value;
  const loaded = current?.projectId === projectId ? current : null;
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
  const [moving, setMoving] = useState<readonly string[] | null>(null);
  const [deleting, setDeleting] = useState<{ paths: string[]; referencing: string[] | null } | null>(null);
  const selecting = selection.active.value;
  const picked = selection.selected.value;

  useEffect(() => {
    let dispose: (() => void) | undefined;
    let cancelled = false;
    selection.end();
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
  const listed = useRef(rows);
  listed.current = rows;
  const dialogOpen = !!moving || !!deleting;

  useEffect(() => {
    if (!selecting || dialogOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }
      const typing =
        event.target instanceof HTMLTextAreaElement ||
        (event.target instanceof HTMLInputElement && event.target.type !== "checkbox");
      if (event.key === "Escape") {
        event.preventDefault();
        selection.end();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a" && !typing) {
        event.preventDefault();
        selection.selectAll(listed.current.map((row) => row.path));
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selecting, dialogOpen]);

  const drag = useScriptsDrag({
    listing,
    carried: (path) => {
      const chosen = selection.selected.peek();
      return chosen.includes(path) ? [...chosen] : [path];
    },
    onLongPress: (path) => selection.start(path),
    onRefused: (message) => showSnackbar({ message }),
    onDrop: (paths, target) =>
      void run(async () => {
        await (await intents()).scripts.move(paths, target);
        selection.end();
      }),
  });

  const openFolder = (next: string) => {
    setQuery("");
    void intents().then((Workspace) =>
      Workspace.window.setListState({ scriptsFolder: next }),
    );
  };

  const remove = (paths: string[]) =>
    void run(async () => {
      await (await intents()).scripts.remove(paths);
      selection.end();
    });

  const requestDelete = (paths: string[]) => {
    void run(async () => {
      const referencing = await (await intents()).scripts.referencing(paths);
      if (referencing?.length === 0) remove(paths);
      else setDeleting({ paths, referencing });
    });
  };

  const onAction = (row: ScriptRow, action: RowAction) => {
    if (action === "rename") setRenaming(row.path);
    else if (action === "move") setMoving([row.path]);
    else if (action === "delete") requestDelete([row.path]);
    else
      void run(async () => {
        const { scripts } = await intents();
        if (action === "duplicate") await scripts.duplicate(row.path);
        else await scripts.download([row.path]);
      });
  };

  const onSelectionAction = (action: SelectionAction) => {
    if (action === "move") setMoving(picked);
    else if (action === "delete") requestDelete(picked);
    else void run(async () => (await intents()).scripts.download(picked));
  };

  const activate = (row: ScriptRow) => {
    if (!drag.clicked()) return;
    if (selecting) {
      selection.toggle(row.path);
      return;
    }
    if (row.kind === "folder") openFolder(row.path);
    else void intents().then((Workspace) => Workspace.window.openScript(row.path));
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
    const main = !!row.pinned;
    return (
      <ListRow
        current={row.kind === "file" && row.path === openScript}
        icon={<RowIcon row={row} />}
        label={row.name}
        description={line}
        aria-label={`${row.kind === "folder" ? "Open folder" : "Open script"} ${row.name}${line ? `, ${line.toLowerCase()}` : ""}`}
        trailing={row.kind === "folder" ? <ChevronIcon /> : undefined}
        selection={main ? "none" : selecting ? "active" : "available"}
        selected={picked.includes(row.path)}
        selectLabel={`Select ${row.name}`}
        onSelectedChange={() =>
          selecting ? selection.toggle(row.path) : selection.start(row.path)
        }
        dropTarget={row.kind === "folder" && drag.target === row.path}
        {...(main ? {} : drag.source(row.path))}
        {...(row.kind === "folder" ? { [DROP_FOLDER]: row.path } : {})}
        actions={
          <RowMenu
            name={row.name}
            main={main}
            onAction={(action) => onAction(row, action)}
          />
        }
        onClick={() => activate(row)}
      />
    );
  };

  return (
    <section aria-label="Scripts" class="flex min-h-0 flex-1 flex-col bg-bg [:root[data-layout=desktop]_&]:bg-paper" {...drag.area}>
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
              <TextField
                frame="inset"
                type="search"
                aria-label="Search scripts"
                placeholder="Search scripts"
                value={query}
                class="text-[16px] [:root[data-layout=desktop]_&]:text-[13px] [&::-webkit-search-cancel-button]:hidden"
                onValueChange={setQuery}
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
            {selecting && !drag.dragging ? (
              <SelectionBar
                count={picked.length}
                onSelectAll={() => selection.selectAll(rows.map((row) => row.path))}
                onAction={onSelectionAction}
                onClose={() => selection.end()}
              />
            ) : (
              <>
                {query.trim() ? (
                  <span class="pl-2 text-[12px] text-muted">Results in all folders</span>
                ) : !loaded ? (
                  <span />
                ) : (
                  <Trail
                    folder={folder}
                    home={home}
                    count={Object.keys(listing.files).length}
                    dropTarget={drag.target}
                    onOpen={openFolder}
                  />
                )}
                <SortMenu
                  value={sort}
                  onChange={(key) =>
                    void intents().then((Workspace) => Workspace.window.setListState({ scriptsSort: key }))
                  }
                />
              </>
            )}
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
        paths={moving}
        listing={listing}
        onClose={() => setMoving(null)}
        onMove={async (paths, target) => {
          await (await intents()).scripts.move(paths, target);
          selection.end();
        }}
        onCreateFolder={(parent, name) =>
          intents().then((Workspace) => Workspace.scripts.create("folder", parent, name))
        }
      />
      <DeleteDialog
        paths={deleting?.paths ?? null}
        referencing={deleting?.referencing ?? null}
        onClose={() => setDeleting(null)}
        onDelete={() => {
          const paths = deleting!.paths;
          setDeleting(null);
          remove(paths);
        }}
      />
    </section>
  );
}

