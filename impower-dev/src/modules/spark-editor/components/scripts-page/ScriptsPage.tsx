import {
  BookIcon,
  Button,
  ChevronIcon,
  DropdownItem,
  FileIcon,
  FolderIcon,
  ListRow,
  PinIcon,
  PlusIcon,
  RootIcon,
  SearchIcon,
  TabbedPage,
} from "@impower/impower-ui/components";
import { useLayout } from "@impower/impower-ui/layout";
import { useComputed } from "@preact/signals";
import { useEffect, useState } from "preact/hooks";
import { plural, referencedByLabel, rowLine } from "../../utils/fileListModel";
import { showSnackbar } from "../../utils/snackbar";
import {
  browseParent,
  crumbsOf,
  folderLabel,
  isInside,
  itemsLabel,
  MAIN_SCRIPT,
  moveCheck,
  parentOf,
  scriptFolders,
  scriptRows,
  scriptsHome,
  type ScriptListing,
  type ScriptRow,
} from "../../workspace/scriptsListing";
import selection from "../../workspace/scriptsSelection";
import workspace from "../../workspace/WorkspaceStore";
import {
  DeleteDialog,
  DROP_FOLDER,
  EmptyState,
  LibraryPage,
  MoveDialog,
  NameRow,
  SelectionBar,
  SortMenu,
  Trail,
  useLibraryDrag,
  useRowFocusReturn,
  useSelectionKeys,
  type SelectionAction,
} from "../library-page";
import { useSavedScroll, useTabQuery } from "./pageState";
import RowMenu, { type RowAction } from "./RowMenu";
import ScriptOutlineTab, { OUTLINE_TAB } from "./ScriptOutlineTab";

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

const ALL_TAB = "all";

function AllScripts() {
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
  const [query, setQuery] = useTabQuery(ALL_TAB);
  const scroller = useSavedScroll(ALL_TAB);
  const [creating, setCreating] = useState<"script" | "folder" | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const focusRenamed = useRowFocusReturn(
    (path) =>
      [...document.querySelectorAll<HTMLElement>("[data-script-path]")].find(
        (element) => element.getAttribute("data-script-path") === path,
      ) ?? null,
  );
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
  useSelectionKeys({
    active: selecting,
    paused: !!moving || !!deleting,
    onEnd: () => selection.end(),
    onSelectAll: () => selection.selectAll(rows.map((row) => row.path)),
  });

  const drag = useLibraryDrag({
    check: (paths, target) => moveCheck(listing, paths, target),
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
          initial={stem}
          suffix={extension}
          onCancel={() => {
            setRenaming(null);
            focusRenamed(row.path);
          }}
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
        data-script-path={row.path}
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

  const searching = !!query.trim();
  return (
    <LibraryPage
      area={drag.area}
      searchLabel="Search scripts"
      query={query}
      onQueryChange={setQuery}
      newMenu={
        <>
          <DropdownItem returnFocus={false} onSelect={() => { setQuery(""); setCreating("script"); }}>
            <FileIcon class="text-muted" />
            Script
          </DropdownItem>
          <DropdownItem returnFocus={false} onSelect={() => { setQuery(""); setCreating("folder"); }}>
            <FolderIcon class="text-muted" />
            Folder
          </DropdownItem>
        </>
      }
      bar={
        selecting && !drag.dragging ? (
          <SelectionBar
            count={picked.length}
            onSelectAll={() => selection.selectAll(rows.map((row) => row.path))}
            onAction={onSelectionAction}
            onClose={() => selection.end()}
          />
        ) : (
          <>
            {searching ? (
              <span class="pl-2 text-[12px] text-muted">Results in all folders</span>
            ) : !loaded ? (
              <span />
            ) : (
              <Trail
                label="Scripts"
                icon={<RootIcon />}
                glyph="small"
                summary={plural(Object.keys(listing.files).length, "script")}
                crumbs={folder ? crumbsOf(folder, home) : []}
                root=""
                parent={browseParent(folder, home)}
                dropTarget={drag.target}
                dropAttribute={DROP_FOLDER}
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
        )
      }
      creating={
        creating && (
          <NameRow
            icon={creating === "script" ? <FileIcon /> : <FolderIcon />}
            label={creating === "script" ? "New script name" : "New folder name"}
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
        )
      }
      list={{
        listRef: scroller,
        label: searching ? "Search results" : "Scripts and folders",
        items: rows,
        getKey: (row) => row.path,
        renderItem: renderRow,
      }}
      empty={
        !loaded ? null : searching ? (
          <EmptyState
            icon={<SearchIcon />}
            title="No scripts match."
            action={<Button variant="quiet" onClick={() => setQuery("")}>Clear search</Button>}
          />
        ) : (
          <EmptyState
            icon={<FolderIcon />}
            title="This folder is empty"
            action={
              <Button onClick={() => setCreating("script")}>
                <PlusIcon />
                New script
              </Button>
            }
          />
        )
      }
    >
      <MoveDialog
        paths={moving}
        label={moving ? itemsLabel(moving) : ""}
        root=""
        folders={[
          "",
          ...scriptFolders(listing).filter(
            (f) => !(moving ?? []).some((p) => !Object.hasOwn(listing.files, p) && isInside(f, p)),
          ),
        ]}
        from={
          moving?.length && moving.every((p) => parentOf(p) === parentOf(moving[0]!))
            ? browseParent(moving[0]!, home)
            : null
        }
        folderLabel={(f) => folderLabel(f, home)}
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
        label={deleting ? itemsLabel(deleting.paths) : null}
        description={
          deleting?.referencing
            ? referencedByLabel(deleting.referencing)
            : `Couldn't check which scripts reference ${deleting?.paths.length === 1 ? "it" : "them"}.`
        }
        onClose={() => setDeleting(null)}
        onDelete={() => {
          const paths = deleting!.paths;
          setDeleting(null);
          remove(paths);
        }}
      />
    </LibraryPage>
  );
}

export default function ScriptsPage() {
  const phone = useLayout() === "phone";
  const tab = useComputed(() => workspace.state.value.lists?.scriptsTab).value;
  return (
    <TabbedPage
      title="Scripts"
      icon={<BookIcon class="size-5 flex-none text-accent" />}
      onBack={() => void intents().then((Workspace) => Workspace.window.navigateTo("write"))}
      showTabs={phone}
      value={tab === OUTLINE_TAB ? OUTLINE_TAB : ALL_TAB}
      onValueChange={(next) =>
        void intents().then((Workspace) => Workspace.window.setListState({ scriptsTab: next }))
      }
      tabs={[
        { value: ALL_TAB, label: "All scripts", content: <AllScripts /> },
        { value: OUTLINE_TAB, label: "In this script", content: <ScriptOutlineTab /> },
      ]}
    />
  );
}
