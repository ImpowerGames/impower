import {
  ArtIcon,
  Button,
  ChevronIcon,
  DropdownItem,
  DropZone,
  FolderIcon,
  FolderPlusIcon,
  FolderCover,
  FontIcon,
  GridIcon,
  type IconComponent,
  ImageIcon,
  LinkIcon,
  ListIcon,
  ListRow,
  MusicIcon,
  Sheet,
  OtherIcon,
  SearchIcon,
  Tab,
  TabbedPage,
  Tabs,
  TextIcon,
  Thumbnail,
  Tile,
  TILE_GAP,
  TILE_MIN_WIDTH,
  tileHeight,
  type TileShape,
  UploadIcon,
  VariantsBadge,
  VariantsChip,
  variantsLabel,
  VideoIcon,
} from "@impower/impower-ui/components";
import { useLayout } from "@impower/impower-ui/layout";
import type { ListsState } from "@impower/spark-editor-protocol/src/types";
import { useComputed } from "@preact/signals";
import { createPortal } from "preact/compat";
import { useEffect, useRef, useState } from "preact/hooks";
import {
  ASSET_TYPES,
  assetEndings,
  assetTypeOf,
  assetTypeSpec,
  isAssetType,
  type AssetType,
} from "../../utils/assetTypes";
import { addMenuFolders, addMenuKindsOf } from "../../utils/addMenuFolders";
import { neighborsOf, type InspectedAsset } from "../../utils/assetDetails";
import { plural, rowLine } from "../../utils/fileListModel";
import type { DropItem } from "../../utils/fileDrops";
import type { FileMove } from "../../utils/fileMoves";
import { majorityShape } from "../../utils/imageSize";
import { showSnackbar } from "../../utils/snackbar";
import {
  ASSET_SORT_FIELDS,
  assetLevel,
  assetSearch,
  assetSort,
  assetMoveCheck,
  assetTrail,
  countsUses,
  coveredPaths,
  folderStackReason,
  foldersUnder,
  thingsLabel,
  type AssetListing,
  type AssetRow,
} from "../../workspace/assetsListing";
import selection from "../../workspace/assetsSelection";
import { usesLabel } from "../../workspace/assetUsage";
import { isInside, parentOf } from "../../workspace/scriptsListing";
import type { SearchGroup } from "../../workspace/searchState";
import type { Sound } from "../../workspace/AudioSession";
import { audioSession } from "../../workspace/editorAudio";
import { useSettings } from "../../workspace/settings/useSettings";
import { AUDITION_OWNER } from "../../workspace/WorkspaceAudition";
import workspace from "../../workspace/WorkspaceStore";
import { AssetInspector, inspectorHost, useInspectorDock, type InspectorHost } from "../asset-inspector";
import { UsesList } from "../find-references-rename";
import {
  DeleteDialog,
  DROP_FOLDER,
  EmptyState,
  LibraryPage,
  MoveDialog,
  NameRow,
  SelectionBar,
  useRowFocusReturn,
  SortMenu,
  Trail,
  useFolderLayout,
  useLibraryDrag,
  useSavedScroll,
  useSelectionKeys,
  useTabQuery,
  type SelectionAction,
} from "../library-page";
import { addAssetFiles, landedView } from "../../workspace/addAssetFiles";
import { folderTitle } from "../../workspace/uploadSession";
import AddUrlDialog from "./AddUrlDialog";
import AssetRowMenu, { type AssetRowAction } from "./AssetRowMenu";
import { SoundLine, SoundPlay } from "./SoundRow";
import UploadsPanel from "./UploadsPanel";
import { useFileDrop } from "./useFileDrop";

export const propDefaults = {};
export type AssetsProps = Partial<typeof propDefaults>;

const EMPTY: AssetListing = { files: {}, folders: [] };

const PAGE_TAB = "all";

const HEADING_HEIGHT = 48;

const SHOWN_USES = 3;

const USES_HINT = "Lines in the scripts that show or play it.";

const COUNTING_NOTE = "Counting uses…";

const UNCOUNTED_NOTE = "Uses could not be counted. Edit a script to try again.";
const ROW_HEIGHT = 63;

const TYPE_ICONS: Record<AssetType, IconComponent> = {
  image: ImageIcon,
  audio: MusicIcon,
  video: VideoIcon,
  text: TextIcon,
  font: FontIcon,
  other: OtherIcon,
};

const TYPE_NOUNS: Record<AssetType, string> = {
  image: "image",
  audio: "audio",
  video: "video",
  text: "text",
  font: "font",
  other: "file",
};

const EMPTY_TYPES: Record<AssetType, readonly [string, string]> = {
  image: ["No images yet", "Upload portraits and backgrounds with the New button."],
  audio: ["No audio yet", "Upload sounds and music with the New button."],
  video: ["No video yet", "Upload a video with the New button."],
  text: ["No text yet", "Upload notes with the New button."],
  font: ["No fonts yet", "Upload a font with the New button."],
  other: ["Nothing yet", "Files of any other type land here when you upload them."],
};

type Heading = { kind: "heading"; type: AssetType; title: string };

type Item = Heading | AssetRow;

let workspaceModule: Promise<typeof import("../../workspace/Workspace")> | undefined;

const intents = async () => (await (workspaceModule ??= import("../../workspace/Workspace"))).Workspace;

const run = async <T,>(action: () => Promise<T>): Promise<T | undefined> => {
  try {
    return await action();
  } catch (e) {
    showSnackbar({ message: e instanceof Error ? e.message : String(e) });
    return undefined;
  }
};

const stemAndExtension = (name: string) => {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
};

const leafOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);

const inspectedOf = (listing: AssetListing, row: AssetRow): InspectedAsset => {
  const facts = listing.files[row.path];
  return {
    path: row.path,
    name: row.name,
    type: row.type,
    link: row.link,
    address: facts?.address,
    src: row.link ? facts?.address : facts?.src,
    files: (row.paths ?? [row.path]).map((path) => ({
      path,
      size: listing.files[path]?.size ?? 0,
      src: listing.files[path]?.src,
    })),
    variantCount: row.variantCount,
  };
};

const srcOf = (listing: AssetListing, path: string) => listing.files[path]?.src;

const soundOf = (listing: AssetListing, path: string): Sound | null => {
  const facts = listing.files[path];
  const src = facts?.address ?? facts?.src;
  return src ? { owner: path, src, size: facts?.address ? undefined : facts?.size } : null;
};

const usesCount = (groups: readonly SearchGroup[]) => groups.reduce((sum, group) => sum + group.uses.length, 0);

const firstUses = (groups: readonly SearchGroup[], count: number): SearchGroup[] => {
  const shown: SearchGroup[] = [];
  let left = count;
  for (const group of groups) {
    if (left <= 0) break;
    shown.push({ ...group, uses: group.uses.slice(0, left) });
    left -= group.uses.length;
  }
  return shown;
};

const followed = (path: string, moves: readonly FileMove[]) => {
  const move = moves.find((m) => m.from === path || isInside(path, m.from));
  return move ? move.to + path.slice(move.from.length) : path;
};

function RowGlyph({ row, listing }: { row: AssetRow; listing: AssetListing }) {
  if (row.kind === "folder") return <FolderIcon />;
  if (row.type === "image" && !row.link) return <Thumbnail src={srcOf(listing, row.path)} />;
  const Glyph = row.link && row.type === "other" ? LinkIcon : TYPE_ICONS[row.type];
  return <Glyph />;
}

function AssetsBrowser() {
  const projectId = workspace.signals.projectId.value;
  const current = workspace.assetListing.value;
  const loaded = current?.projectId === projectId ? current : null;
  const listing = loaded ?? EMPTY;
  const endings = assetEndings.value;
  const counted = workspace.assetUsage.value;
  const usage = counted?.projectId === projectId ? counted : null;
  const uncounted = workspace.assetUsageFailed.value === projectId;
  const lists = useComputed(() => workspace.state.value.lists).value;
  const busy = useComputed(() => {
    const status = workspace.signals.syncStatus.value;
    return (
      workspace.importProgress.value != null ||
      status === "syncing" ||
      status === "loading" ||
      status === "importing" ||
      status === "exporting"
    );
  }).value;
  const [query, setQuery] = useTabQuery("assetsQueries", PAGE_TAB);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [moving, setMoving] = useState<readonly string[] | null>(null);
  const [deleting, setDeleting] = useState<{ paths: readonly string[]; groups: SearchGroup[] | null } | null>(null);
  const upload = useRef<HTMLInputElement | null>(null);
  const newButton = useRef<HTMLButtonElement>(null);
  const selecting = selection.active.value;
  const picked = selection.selected.value;

  useEffect(() => {
    let dispose: (() => void) | undefined;
    let cancelled = false;
    selection.end();
    void intents().then((Workspace) => {
      if (!cancelled) {
        dispose = Workspace.assets.watch();
      }
    });
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [projectId]);

  const type: AssetType = isAssetType(lists?.assetsType) ? lists.assetsType : "image";
  const folders = lists?.assetsFolders ?? {};
  const sort = assetSort(lists?.assetsSort);
  const searching = !!query.trim();
  const level = assetLevel({ listing, type, folder: folders[type], sort, endings, usage });
  const groups = searching ? assetSearch({ listing, query, sort, endings, usage }) : [];
  const lineOf = (row: AssetRow) =>
    rowLine({ entry: row, sort, location: row.location, holdings: row.holdings, usesLabel: usage ? usesLabel : undefined });
  const items: Item[] = searching
    ? groups.flatMap((group) => [
        { kind: "heading", type: group.type, title: group.title } as Heading,
        ...group.rows,
      ])
    : level.rows;
  const files = items.filter((item): item is AssetRow => item.kind === "file");
  const [openPath, setOpenPath] = useState<string | null>(null);
  const [openedIn, setOpenedIn] = useState<InspectorHost | null>(null);
  const lastPath = useRef<string | null>(null);
  const [reveal, setReveal] = useState<{ path: string; request: number } | null>(null);
  const list = useRef<HTMLDivElement | null>(null);
  const page = useRef<HTMLDivElement | null>(null);
  const closeButton = useRef<HTMLButtonElement | null>(null);
  const layoutName = useLayout();
  const dock = useInspectorDock();
  const host = inspectorHost(layoutName, dock);
  const holds = (row: AssetRow, path: string) => row.path === path || !!row.paths?.includes(path);
  const rowOf = (path: string): AssetRow | null =>
    files.find((row) => holds(row, path)) ??
    (Object.hasOwn(listing.files, path)
      ? (assetLevel({
          listing,
          type: assetTypeOf(path, endings, listing.files[path]?.address),
          folder: parentOf(path),
          sort,
          endings,
          usage,
        }).rows.find((row) => row.kind === "file" && holds(row, path)) ?? null)
      : null);
  const openRowOf = openPath && openedIn === host ? rowOf(openPath) : null;
  if (openPath) {
    lastPath.current = openPath;
  }
  const near = openPath ? neighborsOf(files, openPath) : null;

  useEffect(
    () => audioSession.stopUnless((owner, src) => owner === AUDITION_OWNER || soundOf(listing, owner)?.src === src),
    [listing],
  );

  const inspected = useRef<string | null>(null);
  useEffect(() => {
    const closed = !openPath && !!inspected.current;
    inspected.current = openPath;
    if (openPath || closed) {
      audioSession.stopUnless((owner) => owner === AUDITION_OWNER || owner === openPath);
    }
  }, [openPath]);

  useEffect(() => () => audioSession.stopUnless((owner) => owner === AUDITION_OWNER), []);
  const [layout, setLayout] = useFolderLayout(
    "assetsLayouts",
    level.folder,
    type === "image" ? "tiles" : "rows",
  );
  const { projectSettings } = useSettings();
  const tiles = !searching && type === "image" && layout === "tiles";
  const kinds = addMenuKindsOf(
    { path: `${level.folder}/_`, type: "image" },
    addMenuFolders(projectSettings),
  );
  const namedShape: TileShape | undefined = kinds.includes("portrait")
    ? "portrait"
    : kinds.includes("backdrop")
      ? "landscape"
      : undefined;
  const pictures = tiles && !namedShape
    ? level.rows.filter((row) => row.kind === "file" && !row.link).map((row) => row.path)
    : [];
  const sizes = workspace.assetSizes.value;
  const pictureSources = pictures.map((path) => srcOf(listing, path));
  const measuring = pictureSources.some((src) => src && !Object.hasOwn(sizes, src));
  const shape: TileShape =
    namedShape ?? majorityShape(pictureSources.map((src) => (src ? sizes[src] ?? undefined : undefined)));
  const measureKey = JSON.stringify(pictures.map((path, index) => [path, pictureSources[index]]));
  useEffect(() => {
    if (pictures.length) {
      void intents().then((Workspace) => Workspace.assets.measureImages(pictures));
    }
  }, [measureKey]);
  const scrollKey = `${searching ? "search" : `${type}:${level.folder}`}:${sort}`;
  const scroller = useSavedScroll("assetsScrolls", scrollKey);

  const revealRow = (path: string) => setReveal((prev) => ({ path, request: (prev?.request ?? 0) + 1 }));

  const rowElement = (path: string) =>
    [...(list.current?.querySelectorAll<HTMLElement>("[data-asset-path]") ?? [])].find(
      (element) => element.getAttribute("data-asset-path") === path,
    ) ?? null;
  const focusRenamed = useRowFocusReturn(rowElement);

  const returnTarget = (path: string) =>
    rowElement(path) ?? page.current?.querySelector<HTMLElement>('input[type="search"]') ?? null;

  const focusRow = (path: string) => {
    revealRow(path);
    requestAnimationFrame(() => returnTarget(path)?.focus({ preventScroll: true }));
  };

  const settling = useRef<readonly string[]>([]);
  const relocated = useRef<readonly FileMove[]>([]);
  const [settled, setSettled] = useState(0);

  useEffect(() => {
    if (openPath && openRowOf && openRowOf.path !== openPath) {
      setOpenPath(openRowOf.path);
      return;
    }
    if (openPath && !openRowOf) {
      if (settling.current.some((path) => openPath === path || isInside(openPath, path))) {
        return;
      }
      const next = followed(openPath, relocated.current);
      relocated.current = [];
      if (next !== openPath && rowOf(next)) {
        setOpenPath(next);
        return;
      }
      setOpenPath(null);
      const active = document.activeElement;
      const lost = !active || active === document.body || !active.isConnected;
      if (lost && (openedIn !== host || !rowOf(openPath))) {
        focusRow(openPath);
      }
    }
  }, [openPath, openRowOf, settled]);

  const relocating = async (paths: readonly string[], action: () => Promise<readonly FileMove[]>) => {
    settling.current = paths;
    try {
      const moves = await action();
      relocated.current = moves;
      for (const move of moves) selection.replace(move.from, move.to);
    } finally {
      settling.current = [];
      setSettled((count) => count + 1);
    }
  };

  const openAsset = (path: string) => {
    relocated.current = [];
    setOpenedIn(host);
    setOpenPath(path);
  };

  const stepTo = (path: string) => {
    setOpenPath(path);
    revealRow(path);
  };

  const closeInspector = () => {
    const path = openPath;
    setOpenPath(null);
    if (path && host === "dock") {
      focusRow(path);
    }
  };

  const setLists = (lists: Partial<ListsState>) =>
    void intents().then((Workspace) => Workspace.window.setListState(lists));

  const openFolder = (path: string) => {
    setQuery("");
    setLists({ assetsFolders: { ...folders, [type]: path } });
  };

  const show = (landed: readonly string[]) => {
    const view = landedView(landed, level.folder);
    if (!view) {
      return;
    }
    if (view.lists || searching) {
      setQuery("");
    }
    if (view.lists) {
      setLists(view.lists);
    }
    revealRow(view.last);
  };

  const revealing = workspace.assetsReveal.value;
  useEffect(() => {
    if (revealing && loaded) {
      workspace.assetsReveal.value = null;
      show(revealing);
    }
  }, [revealing, loaded]);

  const add = (items: DropItem[], folder: string) => void run(async () => show(await addAssetFiles(items, folder)));

  const onUpload = (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    const chosen = Array.from(input.files ?? []);
    input.value = "";
    if (!chosen.length) return;
    add(
      chosen.map((file) => ({ name: file.name, size: file.size, getBuffer: () => file.arrayBuffer() })),
      level.folder,
    );
  };

  const fileDrop = useFileDrop({
    current: () => level.folder,
    onDrop: add,
  });

  const remove = (paths: readonly string[]) =>
    void run(async () => {
      await (await intents()).assets.remove(paths);
      selection.end();
    });

  const requestDelete = (paths: readonly string[]) =>
    void run(async () => {
      const groups = await (await intents()).assets.usedBy(paths);
      if (groups && usesCount(groups) === 0) remove(paths);
      else setDeleting({ paths, groups });
    });

  const moveTo = async (paths: readonly string[], folder: string) => {
    await relocating(coveredPaths(listing, paths, endings), async () => (await intents()).assets.move(paths, folder));
    selection.end();
  };

  const drag = useLibraryDrag({
    check: (paths, folder) => assetMoveCheck(listing, coveredPaths(listing, paths, endings), folder, endings),
    carried: (path) => {
      const chosen = selection.selected.peek();
      return chosen.includes(path) ? [...chosen] : [path];
    },
    onLongPress: (path) => selection.start(path),
    onRefused: (message) => showSnackbar({ message }),
    onDrop: (paths, folder) => void run(() => moveTo(paths, folder)),
  });

  const listedPaths = items.filter((item): item is AssetRow => item.kind !== "heading").map((row) => row.path);

  useSelectionKeys({
    active: selecting,
    paused: !!moving || !!deleting,
    onEnd: () => selection.end(),
    onSelectAll: () => selection.selectAll(listedPaths),
  });

  const onAction = (row: AssetRow, action: AssetRowAction) => {
    if (action === "select") selection.start(row.path);
    else if (action === "rename") setRenaming(row.path);
    else if (action === "move") setMoving([row.path]);
    else requestDelete([row.path]);
  };

  const onSelectionAction = (action: SelectionAction) => {
    if (action === "move") setMoving(picked);
    else if (action === "delete") requestDelete(picked);
    else void run(async () => (await intents()).assets.downloadAll(picked));
  };

  const openLabel = (row: AssetRow, line: string) => {
    const opens = row.kind === "folder" ? "Open folder" : `Open ${row.link ? "link" : TYPE_NOUNS[row.type]}`;
    const variants = row.variantCount ? `, ${variantsLabel(row.variantCount)}` : "";
    return `${opens} ${row.name}${variants}${line ? `, ${line.toLowerCase()}` : ""}`;
  };

  const openRow = (row: AssetRow) => {
    if (!drag.clicked()) return;
    if (selecting) selection.toggle(row.path);
    else if (row.kind === "folder") openFolder(row.path);
    else openAsset(row.path);
  };

  const selectable = (row: AssetRow) => ({
    selection: selecting ? ("active" as const) : ("available" as const),
    selected: picked.includes(row.path),
    selectLabel: `Select ${row.name}`,
    onSelectedChange: () => (selecting ? selection.toggle(row.path) : selection.start(row.path)),
    dropTarget: row.kind === "folder" && (drag.target === row.path || fileDrop.over?.target === row.path),
    ...drag.source(row.path),
    ...(row.kind === "folder" ? { [DROP_FOLDER]: row.path } : {}),
  });

  const renderTile = (row: AssetRow) => {
    const line = lineOf(row);
    const folder = row.kind === "folder";
    return (
      <Tile
        shape={shape}
        kind={folder ? "folder" : "file"}
        media={
          folder ? (
            <FolderCover sources={(row.covers ?? []).map((path) => srcOf(listing, path))} />
          ) : (
            <Thumbnail size="fill" src={srcOf(listing, row.path)} />
          )
        }
        badge={row.variantCount ? <VariantsBadge count={row.variantCount} /> : undefined}
        label={row.name}
        description={line}
        aria-label={openLabel(row, line)}
        current={!folder && row.path === openPath}
        data-asset-path={row.path}
        {...selectable(row)}
        actions={
          <AssetRowMenu
            name={row.name}
            kept={row.folderStack ? folderStackReason(row.name) : undefined}
            onAction={(action) => onAction(row, action)}
          />
        }
        onClick={() => openRow(row)}
      />
    );
  };

  const renderItem = (item: Item) => {
    if (item.kind === "heading") {
      return (
        <div class="flex h-full items-end border-b border-edge pb-2 pl-1.5">
          <h2 class="text-[13px] font-semibold text-ink">{item.title}</h2>
        </div>
      );
    }
    const row = item;
    if (renaming === row.path) {
      const [stem, extension] =
        row.kind === "folder" ? [row.name, ""] : row.paths ? [row.name, stemAndExtension(leafOf(row.path))[1]!] : stemAndExtension(leafOf(row.path));
      return (
        <NameRow
          icon={<RowGlyph row={row} listing={listing} />}
          label={`Rename ${row.name}`}
          wrapError={tiles}
          initial={stem}
          suffix={extension}
          onCancel={() => {
            setRenaming(null);
            focusRenamed(row.path);
          }}
          onCommit={async (name) => {
            await relocating(row.paths ?? [row.path], async () => [
              { from: row.path, to: await (await intents()).assets.rename(row.path, name) },
            ]);
            setRenaming(null);
          }}
        />
      );
    }
    if (tiles) {
      return renderTile(row);
    }
    const line = lineOf(row);
    const folder = row.kind === "folder";
    const sound = !folder && row.type === "audio" ? soundOf(listing, row.path) : null;
    return (
      <ListRow
        icon={sound ? undefined : <RowGlyph row={row} listing={listing} />}
        control={sound ? <SoundPlay name={row.name} sound={sound} /> : undefined}
        overflow={row.variantCount ? "self" : undefined}
        label={
          row.variantCount ? (
            <span class="flex min-w-0 items-center gap-[7px]">
              <span class="min-w-0 truncate">{row.name}</span>
              <VariantsChip count={row.variantCount} />
            </span>
          ) : (
            row.name
          )
        }
        description={sound ? <SoundLine sound={sound} line={line} /> : line}
        aria-label={openLabel(row, line)}
        trailing={folder ? <ChevronIcon /> : undefined}
        current={!folder && row.path === openPath}
        data-asset-path={row.path}
        {...selectable(row)}
        actions={
          <AssetRowMenu
            name={row.name}
            kept={row.folderStack ? folderStackReason(row.name) : undefined}
            onAction={(action) => onAction(row, action)}
          />
        }
        onClick={() => openRow(row)}
      />
    );
  };

  const inspectorOf = (row: AssetRow) => (
    <AssetInspector
      asset={inspectedOf(listing, row)}
      previous={near?.previous ? { path: near.previous.path, name: near.previous.name } : null}
      next={near?.next ? { path: near.next.path, name: near.next.name } : null}
      host={host}
      intents={intents}
      relocate={relocating}
      onStep={stepTo}
      onClose={closeInspector}
      closeRef={closeButton}
    />
  );
  const inspector = openRowOf ? inspectorOf(openRowOf) : null;
  const closing = !inspector && lastPath.current ? rowOf(lastPath.current) : null;
  const lastInspector = inspector ?? (closing ? inspectorOf(closing) : null);

  const TypeGlyph = TYPE_ICONS[type];
  const trail = assetTrail(listing, level.root, level.folder);
  const atRoot = level.folder === level.root;
  const [emptyTitle, emptyBody] = EMPTY_TYPES[type];
  const uploadAction = (
    <Button disabled={busy} onClick={() => upload.current?.click()}>
      <UploadIcon />
      Upload files
    </Button>
  );

  return (
    <LibraryPage<Item>
      area={{
        ref: page,
        ...fileDrop.area,
        onDragOver: (event: DragEvent) => {
          drag.area.onDragOver(event);
          fileDrop.area.onDragOver(event);
        },
        onDragLeave: drag.area.onDragLeave,
        onDrop: (event: DragEvent) => {
          drag.area.onDrop(event);
          fileDrop.area.onDrop(event);
        },
      }}
      overlay={fileDrop.over && <DropZone title={`Drop to add to ${folderTitle(listing, fileDrop.over.folder)}`} />}
      foot={<UploadsPanel listing={listing} />}
      searchLabel="Search assets"
      query={query}
      onQueryChange={setQuery}
      newAttributes={{ "data-assets-action": "add" }}
      newRef={newButton}
      newMenu={
        <>
          <DropdownItem disabled={busy} onSelect={() => upload.current?.click()}>
            <UploadIcon class="text-muted" />
            Upload files
          </DropdownItem>
          <DropdownItem disabled={busy} onSelect={() => setLinking(true)}>
            <LinkIcon class="text-muted" />
            Link a file by address
          </DropdownItem>
          <DropdownItem returnFocus={false} onSelect={() => { setQuery(""); setCreating(true); }}>
            <FolderPlusIcon class="text-muted" />
            New folder
          </DropdownItem>
        </>
      }
      tabs={
        searching ? undefined : (
          <Tabs
            variant="inline"
            iconLayout="beside"
            scroll
            value={type}
            onChange={(next) => setLists({ assetsType: next })}
            class="flex-none border-b border-edge"
          >
            {ASSET_TYPES.map((spec) => (
              <Tab key={spec.type} value={spec.type}>
                {spec.title}
              </Tab>
            ))}
          </Tabs>
        )
      }
      bar={
        selecting && !drag.dragging ? (
          <SelectionBar
            count={picked.length}
            onSelectAll={() => selection.selectAll(listedPaths)}
            onAction={onSelectionAction}
            onClose={() => selection.end()}
          />
        ) : (
        <>
          {searching ? (
            <span class="pl-2 text-[12px] text-muted">Results in all types</span>
          ) : !loaded ? (
            <span />
          ) : (
            <Trail
              label={assetTypeSpec(type).title}
              icon={<TypeGlyph />}
              summary={plural(level.files, "file")}
              crumbs={trail.crumbs}
              root={level.root}
              parent={trail.parent}
              dropTarget={drag.target ?? fileDrop.over?.target ?? null}
              dropAttribute={DROP_FOLDER}
              onOpen={openFolder}
            />
          )}
          {!searching && loaded && type === "image" && !level.empty && (
            <Button
              variant="quiet"
              size="icon"
              class="ml-auto flex-none text-muted"
              aria-label={tiles ? "Show this folder as rows" : "Show this folder as tiles"}
              title={tiles ? "Show as rows" : "Show as tiles"}
              data-assets-action="layout"
              onClick={() => setLayout(tiles ? "rows" : "tiles")}
            >
              {tiles ? <ListIcon /> : <GridIcon />}
            </Button>
          )}
          <SortMenu
            value={sort}
            fields={ASSET_SORT_FIELDS}
            usesHint={USES_HINT}
            note={!usage && countsUses(sort) ? (uncounted ? UNCOUNTED_NOTE : COUNTING_NOTE) : undefined}
            onChange={(key) => setLists({ assetsSort: key })}
          />
        </>
        )
      }
      creating={
        creating && (
          <NameRow
            icon={<FolderIcon />}
            label="New folder name"
            returnFocus={() => newButton.current}
            onCancel={() => setCreating(false)}
            onCommit={async (name) => {
              const path = await (await intents()).assets.createFolder(level.folder, name);
              setCreating(false);
              openFolder(path);
            }}
          />
        )
      }
      list={measuring ? null : {
        listRef: (element: HTMLDivElement | null) => {
          list.current = element;
          scroller(element);
        },
        revealIndex: reveal ? items.findIndex((item) => item.kind !== "heading" && item.path === reveal.path) : undefined,
        revealRequest: reveal?.request,
        label: searching ? "Search results" : "Assets and folders",
        items,
        getKey: (item) => (item.kind === "heading" ? `heading:${item.type}` : item.path),
        renderItem,
        itemHeight: (item) => (item.kind === "heading" ? HEADING_HEIGHT : ROW_HEIGHT),
        grid: tiles
          ? { minWidth: TILE_MIN_WIDTH[shape], gap: TILE_GAP, height: (width) => tileHeight(shape, width) }
          : undefined,
      }}
      empty={
        !loaded || measuring ? null : searching ? (
          <EmptyState
            icon={<SearchIcon />}
            title="No files match."
            action={<Button variant="quiet" onClick={() => setQuery("")}>Clear search</Button>}
          />
        ) : level.none ? (
          <EmptyState
            icon={<ImageIcon />}
            title="A collection of your art"
            body="Your portraits, backgrounds, sounds and music will appear here."
            action={uploadAction}
          />
        ) : atRoot ? (
          <EmptyState icon={<TypeGlyph />} title={emptyTitle} body={emptyBody} />
        ) : (
          <EmptyState
            icon={<FolderIcon />}
            title="This folder is empty"
            body="Upload into it with the New button."
          />
        )
      }
    >
      <input ref={upload} type="file" multiple class="hidden" onChange={onUpload} />
      <AddUrlDialog
        open={linking}
        onClose={() => setLinking(false)}
        onSubmit={(url, name) =>
          void run(async () => {
            const path = await (await intents()).assets.addLink(url, name, level.folder);
            show([path]);
          })
        }
      />
      <MoveDialog
        paths={moving}
        label={moving ? thingsLabel(listing, coveredPaths(listing, moving, endings), endings) : ""}
        root={level.root}
        folders={foldersUnder(listing, level.root).filter(
          (f) => !(moving ?? []).some((p) => !Object.hasOwn(listing.files, p) && isInside(f, p)),
        )}
        from={moving?.length && moving.every((p) => parentOf(p) === parentOf(moving[0]!)) ? parentOf(moving[0]!) : null}
        folderLabel={(f) => (f === level.root ? assetTypeSpec(type).title : f.slice(level.root.length + 1))}
        onClose={() => setMoving(null)}
        onMove={moveTo}
        onCreateFolder={(parent, name) => intents().then((Workspace) => Workspace.assets.createFolder(parent, name))}
      />
      <DeleteDialog
        label={deleting ? thingsLabel(listing, coveredPaths(listing, deleting.paths, endings), endings) : null}
        description={
          deleting?.groups
            ? `Used in ${plural(usesCount(deleting.groups), "line")}`
            : `Couldn't check which scripts use ${deleting?.paths.length === 1 ? "it" : "them"}.`
        }
        onClose={() => setDeleting(null)}
        onDelete={() => {
          const paths = deleting!.paths;
          setDeleting(null);
          remove(paths);
        }}
      >
        {deleting?.groups && usesCount(deleting.groups) > 0 && (
          <div class="-mx-2 mt-1" data-delete-uses>
            <UsesList
              groups={firstUses(deleting.groups, SHOWN_USES)}
              onOpen={(use) => {
                setDeleting(null);
                void intents().then((Workspace) => Workspace.window.revealDocument(use.uri, use.range));
              }}
            />
            {usesCount(deleting.groups) > SHOWN_USES && (
              <p class="m-0 px-2 pt-1 text-[12px] text-muted">
                and {plural(usesCount(deleting.groups) - SHOWN_USES, "more line")}
              </p>
            )}
          </div>
        )}
      </DeleteDialog>
      {inspector && host === "dock" && dock ? createPortal(inspector, dock) : null}
      {host === "sheet" && (
        <Sheet
          size="full"
          flush
          open={!!openRowOf}
          onOpenChange={(open) => {
            if (!open) closeInspector();
          }}
          initialFocus={closeButton}
          returnFocus={() => (lastPath.current ? returnTarget(lastPath.current) : null)}
        >
          {lastInspector}
        </Sheet>
      )}
    </LibraryPage>
  );
}

export default function Assets(_props: AssetsProps) {
  return (
    <TabbedPage
      title="Assets"
      icon={<ArtIcon class="size-5 flex-none text-accent" />}
      onBack={() => void intents().then((Workspace) => Workspace.window.navigateTo("write"))}
      showTabs={false}
      value={PAGE_TAB}
      onValueChange={() => {}}
      tabs={[{ value: PAGE_TAB, label: "Assets", content: <AssetsBrowser /> }]}
    />
  );
}
