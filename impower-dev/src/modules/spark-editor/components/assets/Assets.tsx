import {
  ArtIcon,
  Button,
  ChevronIcon,
  DropdownItem,
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
import { majorityShape } from "../../utils/imageSize";
import { showSnackbar } from "../../utils/snackbar";
import {
  ASSET_SORT_FIELDS,
  assetLevel,
  assetSearch,
  assetSort,
  assetTrail,
  type AssetListing,
  type AssetRow,
} from "../../workspace/assetsListing";
import { parentOf } from "../../workspace/scriptsListing";
import { useSettings } from "../../workspace/settings/useSettings";
import workspace from "../../workspace/WorkspaceStore";
import { AssetInspector, inspectorHost, useInspectorDock, type InspectorHost } from "../asset-inspector";
import {
  EmptyState,
  LibraryPage,
  NameRow,
  SortMenu,
  Trail,
  useFolderLayout,
  useSavedScroll,
  useTabQuery,
} from "../library-page";
import AddUrlDialog from "./AddUrlDialog";
import AssetRowMenu, { type AssetRowAction } from "./AssetRowMenu";

export const propDefaults = {};
export type AssetsProps = Partial<typeof propDefaults>;

const EMPTY: AssetListing = { files: {}, folders: [] };

const PAGE_TAB = "all";

const HEADING_HEIGHT = 48;
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
  const upload = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let dispose: (() => void) | undefined;
    let cancelled = false;
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
  const level = assetLevel({ listing, type, folder: folders[type], sort, endings });
  const groups = searching ? assetSearch({ listing, query, sort, endings }) : [];
  const items: Item[] = searching
    ? groups.flatMap((group) => [
        { kind: "heading", type: group.type, title: group.title } as Heading,
        ...group.rows,
      ])
    : level.rows;
  const files = items.filter((item): item is AssetRow => item.kind === "file");
  const [openPath, setOpenPath] = useState<string | null>(null);
  const [openedIn, setOpenedIn] = useState<InspectorHost | null>(null);
  const shownRow = useRef<AssetRow | null>(null);
  const [reveal, setReveal] = useState<{ path: string; request: number } | null>(null);
  const list = useRef<HTMLDivElement | null>(null);
  const closeButton = useRef<HTMLButtonElement | null>(null);
  const layoutName = useLayout();
  const dock = useInspectorDock();
  const host = inspectorHost(layoutName, dock);
  const listed = openPath && openedIn === host ? files.find((row) => row.path === openPath) : undefined;
  const openRowOf =
    listed ??
    (openPath && openedIn === host && shownRow.current?.path === openPath && Object.hasOwn(listing.files, openPath)
      ? shownRow.current
      : null);
  if (openRowOf) {
    shownRow.current = openRowOf;
  }
  const near = openPath ? neighborsOf(files, openPath) : null;
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
  const scrollKey = searching ? "search" : `${type}:${level.folder}`;
  const scroller = useSavedScroll("assetsScrolls", scrollKey);

  useEffect(() => {
    if (openPath && !openRowOf) {
      setOpenPath(null);
    }
  }, [openPath, openRowOf]);

  const revealRow = (path: string) => setReveal((prev) => ({ path, request: (prev?.request ?? 0) + 1 }));

  const rowElement = (path: string) =>
    [...(list.current?.querySelectorAll<HTMLElement>("[data-asset-path]") ?? [])].find(
      (element) => element.getAttribute("data-asset-path") === path,
    ) ?? null;

  const openAsset = (path: string) => {
    setOpenedIn(host);
    setOpenPath(path);
  };

  const stepTo = (path: string) => {
    setOpenPath(path);
    revealRow(path);
  };

  const closeInspector = () => {
    const path = shownRow.current?.path;
    setOpenPath(null);
    if (path && host === "dock") {
      revealRow(path);
      requestAnimationFrame(() => rowElement(path)?.focus({ preventScroll: true }));
    }
  };

  const setLists = (lists: Partial<ListsState>) =>
    void intents().then((Workspace) => Workspace.window.setListState(lists));

  const openFolder = (path: string) => {
    setQuery("");
    setLists({ assetsFolders: { ...folders, [type]: path } });
  };

  const show = (landed: readonly string[]) => {
    const last = landed[landed.length - 1];
    if (!last || landed.some((path) => parentOf(path) === level.folder)) {
      return;
    }
    const facts = workspace.assetListing.peek()?.files[last];
    const landedType = assetTypeOf(last, assetEndings.peek(), facts?.address);
    setQuery("");
    setLists({
      assetsType: landedType,
      assetsFolders: { ...folders, [landedType]: parentOf(last) },
    });
  };

  const onUpload = (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    const chosen = Array.from(input.files ?? []);
    input.value = "";
    if (!chosen.length) return;
    void run(async () => {
      const landed = await (await intents()).assets.upload(
        chosen.map((file) => ({ name: file.name, getBuffer: () => file.arrayBuffer() })),
        level.folder,
      );
      show(landed);
    });
  };

  const onAction = (row: AssetRow, action: AssetRowAction) => {
    if (action === "rename") setRenaming(row.path);
    else void run(async () => (await intents()).assets.remove(row.paths ?? [row.path]));
  };

  const openLabel = (row: AssetRow, line: string) => {
    const opens = row.kind === "folder" ? "Open folder" : `Open ${row.link ? "link" : TYPE_NOUNS[row.type]}`;
    const variants = row.variantCount ? `, ${variantsLabel(row.variantCount)}` : "";
    return `${opens} ${row.name}${variants}${line ? `, ${line.toLowerCase()}` : ""}`;
  };

  const openRow = (row: AssetRow) => (row.kind === "folder" ? openFolder(row.path) : openAsset(row.path));

  const renderTile = (row: AssetRow) => {
    const line = rowLine({ entry: row, sort, location: row.location, holdings: row.holdings });
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
        actions={<AssetRowMenu row={row} onAction={(action) => onAction(row, action)} />}
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
      const [stem, extension] = row.kind === "file" ? stemAndExtension(leafOf(row.path)) : [row.name, ""];
      return (
        <NameRow
          icon={<RowGlyph row={row} listing={listing} />}
          label={`Rename ${row.name}`}
          refocusOnce
          wrapError={tiles}
          initial={stem}
          suffix={extension}
          onCancel={() => setRenaming(null)}
          onCommit={async (name) => {
            await (await intents()).assets.rename(row.path, name);
            setRenaming(null);
          }}
        />
      );
    }
    if (tiles) {
      return renderTile(row);
    }
    const line = rowLine({ entry: row, sort, location: row.location, holdings: row.holdings });
    const folder = row.kind === "folder";
    return (
      <ListRow
        icon={<RowGlyph row={row} listing={listing} />}
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
        description={line}
        aria-label={openLabel(row, line)}
        trailing={folder ? <ChevronIcon /> : undefined}
        current={!folder && row.path === openPath}
        data-asset-path={row.path}
        actions={<AssetRowMenu row={row} onAction={(action) => onAction(row, action)} />}
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
      onStep={stepTo}
      onClose={closeInspector}
      closeRef={closeButton}
    />
  );
  const inspector = openRowOf ? inspectorOf(openRowOf) : null;
  const lastInspector = inspector ?? (shownRow.current ? inspectorOf(shownRow.current) : null);

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
      searchLabel="Search assets"
      query={query}
      onQueryChange={setQuery}
      newAttributes={{ "data-assets-action": "add" }}
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
          <DropdownItem onSelect={() => { setQuery(""); setCreating(true); }}>
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
            onChange={(key) => setLists({ assetsSort: key })}
          />
        </>
      }
      creating={
        creating && (
          <NameRow
            icon={<FolderIcon />}
            label="New folder name"
            refocusOnce
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
          returnFocus={() => (shownRow.current ? rowElement(shownRow.current.path) : null)}
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
