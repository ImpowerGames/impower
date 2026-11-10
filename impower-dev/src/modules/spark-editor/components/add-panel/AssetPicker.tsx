import {
  ArrowIcon,
  Button,
  Carousel,
  CheckIcon,
  ListRow,
  PortraitThumbnail,
  SettingsIcon,
  Thumbnail,
} from "@impower/impower-ui/components";
import { useLayout } from "@impower/impower-ui/layout";
import { useEffect, useRef, useState } from "preact/hooks";
import { addMenuFolders } from "../../utils/addMenuFolders";
import { assetEndings, assetTypeOf } from "../../utils/assetTypes";
import { useSettings } from "../../workspace/settings/useSettings";
import workspace from "../../workspace/WorkspaceStore";
import type { PickerRow } from "./addRows";
import { lengthLabel, pickerItems, type PickerItem } from "./pickerItems";
import { intents } from "./workspaceIntents";

export type AssetPickerProps = {
  filename: string;
  row: PickerRow;
  onInsert: (name?: string) => void;
  onLeave: () => void;
};

const THUMBNAIL_SECTION = "add-folder-preferences";

function usePickerItems(row: PickerRow): PickerItem[] | null {
  const projectId = workspace.signals.projectId.value;
  const listing = workspace.assetListing.value;
  const endings = assetEndings.value;
  const { projectSettings } = useSettings();
  useEffect(() => {
    let dispose: (() => void) | undefined;
    let cancelled = false;
    void intents().then((Workspace) => {
      if (!cancelled) dispose = Workspace.assets.watch();
    });
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [projectId]);
  if (!listing || listing.projectId !== projectId) {
    return null;
  }
  const files = Object.entries(listing.files).map(([path, facts]) => ({
    path,
    type: assetTypeOf(path, endings, facts.address),
    src: facts.src,
  }));
  return pickerItems(row.picker.kind, files, addMenuFolders(projectSettings));
}

function useLengths(row: PickerRow, items: PickerItem[] | null) {
  const durations = workspace.assetDurations.value;
  const sound = row.picker.audition === "sound";
  const key = sound && items ? items.map((item) => item.path).join("\n") : "";
  useEffect(() => {
    if (key) {
      void intents().then((Workspace) => Workspace.assets.measureDurations(key.split("\n")));
    }
  }, [key]);
  return (item: PickerItem) => {
    const seconds = item.src ? durations[item.src] : undefined;
    return sound && seconds != null ? lengthLabel(seconds) : "";
  };
}

function Picture({ row, item, fill }: { row: PickerRow; item: PickerItem; fill: boolean }) {
  const { preferences } = useSettings();
  const place = fill ? "h-0 min-h-0 flex-1" : undefined;
  if (row.picker.audition === "sound") {
    return <Thumbnail size={fill ? "fill" : "card"} class={place} glyph={<row.Icon />} />;
  }
  if (row.picker.kind === "portrait") {
    return <PortraitThumbnail size={fill ? "fill" : "tile"} class={place} src={item.src} crop={preferences.portraitCrop} />;
  }
  return <Thumbnail size={fill ? "fill" : "card"} class={place} src={item.src} />;
}

function Empty({ row, onInsert, onLeave }: Pick<AssetPickerProps, "row" | "onInsert" | "onLeave">) {
  const { projectSettings } = useSettings();
  const folder = addMenuFolders(projectSettings)[row.picker.kind];
  const openAssets = () => {
    onLeave();
    void intents().then((Workspace) => {
      Workspace.window.setListState({ assetsType: row.picker.audition === "sound" ? "audio" : "image" });
      Workspace.window.navigateTo("collection");
    });
  };
  return (
    <div
      class="flex min-h-45 flex-col items-center justify-center gap-3 px-4 py-7 text-center text-muted [&>svg]:size-8"
      data-picker-empty
    >
      <row.Icon />
      <p class="m-0 text-[14px]/[1.5]">{row.picker.empty}</p>
      <p class="m-0 text-[12px]/[1.5]">{row.picker.emptyHelp(folder)}</p>
      <Button variant="quiet" onClick={openAssets}>
        Open Assets
        <ArrowIcon />
      </Button>
      <Button variant="quiet" onClick={() => onInsert()}>
        Type a name instead
      </Button>
    </div>
  );
}

export default function AssetPicker({ filename, row, onInsert, onLeave }: AssetPickerProps) {
  const phone = useLayout() === "phone";
  const items = usePickerItems(row);
  const lengthOf = useLengths(row, items);

  const root = useRef<HTMLDivElement>(null);
  const loaded = items !== null;

  useEffect(
    () => () => {
      void intents().then((Workspace) => Workspace.audition.revert());
    },
    [],
  );

  useEffect(() => {
    if (loaded) {
      root.current
        ?.querySelector<HTMLElement>("[data-picker-item], [data-picker-empty] button")
        ?.focus({ preventScroll: true });
    }
  }, [loaded]);

  return (
    <div ref={root} class="contents" data-picker={row.picker.kind}>
      {!items ? (
        <div class="min-h-45" data-picker-loading />
      ) : !items.length ? (
        <Empty row={row} onInsert={onInsert} onLeave={onLeave} />
      ) : (
        <Cards
          filename={filename}
          row={row}
          items={items}
          lengthOf={lengthOf}
          phone={phone}
          onInsert={onInsert}
          onLeave={onLeave}
        />
      )}
    </div>
  );
}

function Cards({
  filename,
  row,
  items,
  lengthOf,
  phone,
  onInsert,
  onLeave,
}: AssetPickerProps & {
  items: PickerItem[];
  lengthOf: (item: PickerItem) => string;
  phone: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [position, setPosition] = useState(0);
  const picked = items.find((item) => item.id === selected) ?? null;

  const captionOf = (item: PickerItem) => [lengthOf(item), item.caption].filter(Boolean).join(" · ");
  const spoken = (item: PickerItem) => [item.name, captionOf(item)].filter(Boolean).join(", ");

  const audition = (item: PickerItem) => {
    setSelected(item.id);
    setPosition(items.indexOf(item));
    void intents().then((Workspace) => {
      if (row.picker.audition === "sound") {
        if (item.src) Workspace.audition.show({ kind: "sound", src: item.src });
        else Workspace.audition.revert();
        return;
      }
      Workspace.audition.show({
        kind: "picture",
        filename,
        construct: row.construct,
        name: item.reference,
      });
    });
  };

  const use = (item: PickerItem) => {
    void intents().then((Workspace) => {
      Workspace.audition.commit();
      onInsert(item.reference);
    });
  };

  if (phone) {
    const openPreference = () => {
      onLeave();
      void intents().then((Workspace) => Workspace.window.navigateTo("project", THUMBNAIL_SECTION));
    };
    return (
      <Carousel
        class="min-h-0 flex-1"
        label={row.picker.browse}
        previousLabel={row.picker.previous}
        nextLabel={row.picker.next}
        index={position}
        onIndexChange={setPosition}
        trailing={
          row.picker.thumbnailPreference ? (
            <Button
              variant="quiet"
              size="glyph"
              class="text-muted"
              aria-label="Portrait thumbnail preferences"
              title="Portrait thumbnail preferences"
              onClick={openPreference}
            >
              <SettingsIcon />
            </Button>
          ) : undefined
        }
      >
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            class="flex flex-col items-stretch text-left focus-inset"
            aria-label={`Add ${spoken(item)}`}
            data-picker-item={item.reference}
            onClick={() => use(item)}
          >
            <Picture row={row} item={item} fill />
            <span class="flex-none px-2.5 py-1.75">
              <strong class="block truncate text-[13px]/[1.4] font-semibold">{item.name}</strong>
              {captionOf(item) && <small class="block truncate text-[12px]/[1.4] text-muted">{captionOf(item)}</small>}
            </span>
          </button>
        ))}
      </Carousel>
    );
  }

  return (
    <>
      <div role="group" aria-label={`${row.label} options`} class="min-h-0 flex-1 overflow-y-auto p-1.5" data-picker-list>
        {items.map((item) => (
          <ListRow
            key={item.id}
            size="block"
            selected={item.id === selected}
            class="has-[[aria-pressed=true]]:ring-1 has-[[aria-pressed=true]]:ring-accent has-[[aria-pressed=true]]:ring-inset"
            icon={<Picture row={row} item={item} fill={false} />}
            label={<strong class="block font-semibold">{item.name}</strong>}
            description={captionOf(item) || undefined}
            trailing={item.id === selected ? <CheckIcon class="text-accent!" /> : undefined}
            aria-pressed={item.id === selected}
            aria-label={`Preview ${spoken(item)}`}
            data-picker-item={item.reference}
            onClick={() => audition(item)}
          />
        ))}
      </div>
      <footer class="flex min-h-14.5 flex-none items-center justify-between gap-2 border-t border-edge px-3 py-1.5">
        <span class="text-[11px]/[1.4] text-muted" data-picker-status>
          {picked ? row.picker.active : row.picker.idle}
        </span>
        <Button variant="primary" disabled={!picked} onClick={() => picked && use(picked)}>
          {row.picker.use}
        </Button>
      </footer>
    </>
  );
}
