import {
  readLocalKey,
  sameLiteral,
  type SaveValues,
} from "@impower/sparkdown/src/program/saveValueSet";
import {
  checkStartingValue,
  listingItems,
  type StartingValueItem,
  type StartingValueListing,
} from "@impower/sparkdown/src/program/startingValueLiterals";

export interface SaveRow {
  id: string;
  kind: "lastRun" | "saved";
  name: string;
  scene: string;
  line: number;
  time: number;
  gone: boolean;
}

export interface SaveValuesState {
  save: SaveRow;
  values: SaveValues;
  listing?: StartingValueListing;
  search: string;
  drafts: Record<string, string>;
  unsaved: Record<string, string>;
}

export interface SavesViewState {
  open: boolean;
  playing: boolean;
  saves: SaveRow[];
  rowMenu?: string;
  renaming?: string;
  values?: SaveValuesState;
}

export interface SaveNoteState {
  name: string;
  failed?: string;
  play?: boolean;
  renaming?: boolean;
}

export const SAVE_TEXT = {
  saveHere: "Save here",
  lastRun: "Last run",
  saved: "Saved",
  playFromHere: "Play from here",
  editValues: "Edit values",
  rename: "Rename",
  delete: "Delete",
  gone: "Its line is gone",
  none: "No saves yet",
  notSaved: "Not saved",
  notPlayed: "Not played",
  loadSave: "Load a save",
} as const;

export const enteringName = (scene: string) => `Entering ${scene}`;

export const savedName = (scene: string, line: number) =>
  `${scene}, line ${line + 1}`;

export const savedAs = (name: string) => `Saved as "${name}"`;

export const saveTime = (time: number) =>
  new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export const saveDetail = (row: SaveRow): string => {
  const place = savedName(row.scene, row.line);
  return row.kind === "lastRun" || row.name === place
    ? saveTime(row.time)
    : `${place} · ${saveTime(row.time)}`;
};

export const saveGroups = (
  saves: readonly SaveRow[],
): { kind: SaveRow["kind"]; label: string; rows: SaveRow[] }[] =>
  (["lastRun", "saved"] as const)
    .map((kind) => ({
      kind,
      label: kind === "lastRun" ? SAVE_TEXT.lastRun : SAVE_TEXT.saved,
      rows: saves.filter((save) => save.kind === kind),
    }))
    .filter((group) => group.rows.length > 0);

export interface SaveValueRow {
  key: string;
  name: string;
  line?: number;
  field: boolean;
  text: string;
  value?: string;
  first?: string;
  differs: boolean;
  badge?: { status: "warning" | "error"; message: string };
  item?: StartingValueItem;
}

export interface SaveValueGroup {
  group: string;
  label: string;
  rows: SaveValueRow[];
}

export const localsLabel = (save: SaveRow) => `Locals at line ${save.line + 1}`;

const GROUP_LABELS: Record<string, string> = {
  stores: "Stores",
  visits: "Visits",
  randomization: "Randomization",
};

export const saveValueGroups = (state: SaveValuesState): SaveValueGroup[] => {
  const search = state.search.trim().toLowerCase();
  const matches = (name: string) => !search || name.toLowerCase().includes(search);
  const groups: SaveValueGroup[] = [];
  const groupOf = (group: string, label: string) => {
    let found = groups.find((g) => g.group === group);
    if (!found) {
      found = { group, label, rows: [] };
      groups.push(found);
    }
    return found;
  };
  const values = state.values.values;
  const rowOf = (key: string, name: string, extra: Partial<SaveValueRow>) => {
    const value = Object.hasOwn(values, key) ? values[key] : undefined;
    const draft = state.drafts[key];
    const text = draft ?? value ?? extra.first ?? "";
    const unsaved = state.unsaved[key];
    const check =
      draft !== undefined
        ? checkStartingValue(
            extra.item ?? { key, group: "stores", name, first: "" },
            draft,
          )
        : undefined;
    const row: SaveValueRow = {
      key,
      name,
      field: false,
      text,
      differs:
        value !== undefined &&
        extra.first !== undefined &&
        !sameLiteral(value, extra.first),
      ...extra,
      ...(value !== undefined ? { value } : {}),
    };
    if (unsaved !== undefined && draft === undefined) {
      row.badge = {
        status: "error",
        message: `Your change was not saved, so this is back to ${unsaved}.`,
      };
    } else if (check && check.status !== "ok") {
      row.badge = check;
    }
    return row;
  };
  for (const item of state.listing?.items ?? []) {
    if (item.group === "parameters") {
      continue;
    }
    const rows = [item, ...(item.fields ?? [])].map((entry, i) =>
      rowOf(entry.key, entry.name, {
        first: entry.first,
        field: i > 0,
        item: entry,
        ...(entry.line !== undefined && /^(place|form):/.test(entry.key)
          ? { line: entry.line + 1 }
          : {}),
      }),
    );
    const shown = rows.filter(
      (row, i) => matches(row.name) || (i > 0 && matches(item.name)),
    );
    if (shown.length > 0) {
      groupOf(item.group, GROUP_LABELS[item.group] ?? item.group).rows.push(...shown);
    }
  }
  const locals = Object.keys(values)
    .map((key) => ({ key, local: readLocalKey(key) }))
    .filter((entry) => entry.local !== undefined)
    .sort((a, b) => b.local!.frame - a.local!.frame);
  for (const { key, local } of locals) {
    if (!matches(local!.name)) {
      continue;
    }
    const frame = state.values.frames[local!.frame];
    const outer = local!.frame < state.values.frames.length - 1;
    groupOf("locals", localsLabel(state.save)).rows.push(
      rowOf(key, local!.name, {
        ...(outer && frame?.line !== undefined ? { line: frame.line + 1 } : {}),
      }),
    );
  }
  return groups;
};

export const saveValuesStatus = (state: SaveValuesState): string => {
  const items = listingItems(state.listing).filter(
    (item) => item.group !== "parameters",
  );
  const values = state.values.values;
  const differ = items.filter(
    (item) =>
      Object.hasOwn(values, item.key) && !sameLiteral(values[item.key]!, item.first),
  ).length;
  return `${differ} of ${items.length} values differ from their first values`;
};

export const loadedStatus = (count: number, name: string) =>
  `Loaded ${count} ${count === 1 ? "value" : "values"} from ${name}`;

export const notLoadedStatus = (name: string) =>
  `The values from ${name} were not saved`;
