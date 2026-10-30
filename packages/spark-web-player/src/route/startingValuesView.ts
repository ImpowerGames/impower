import {
  checkStartingValue,
  listingItems,
  parseLiteral,
  unresolvedMessage,
  unresolvedName,
  type StartingValueGroup,
  type StartingValueItem,
  type StartingValueListing,
  type StartingValueSet,
} from "@impower/sparkdown/src/program/startingValueLiterals";

export type RouteTab = "route" | "values";

export interface ValueBadge {
  status: "warning" | "error";
  message: string;
}

export interface StartingValuesViewState {
  start?: string;
  listing?: StartingValueListing;
  values: StartingValueSet;
  drafts: Record<string, string>;
  unsaved: Record<string, string>;
  search: string;
}

export const emptyValuesState = (): StartingValuesViewState => ({
  values: {},
  drafts: {},
  unsaved: {},
  search: "",
});

export interface ValueRow {
  key: string;
  name: string;
  line?: number;
  field: boolean;
  text: string;
  first: string;
  value?: string;
  set: boolean;
  badge?: ValueBadge;
  item?: StartingValueItem;
  unresolved: boolean;
}

export interface ValueGroup {
  group: StartingValueGroup | "unresolved";
  label: string;
  note?: string;
  rows: ValueRow[];
}

export const GROUP_LABELS: Record<ValueGroup["group"], string> = {
  parameters: "Parameters",
  stores: "Stores",
  visits: "Visits",
  randomization: "Randomization",
  unresolved: "No longer in the script",
};

const badgeOf = (
  item: StartingValueItem,
  text: string | undefined,
  state: StartingValuesViewState,
): ValueBadge | undefined => {
  const unsaved = state.unsaved[item.key];
  if (unsaved !== undefined) {
    return {
      status: "error",
      message: `Your change was not saved, so this is back to ${unsaved}.`,
    };
  }
  if (text === undefined) {
    return item.group === "parameters"
      ? { status: "warning", message: "Unset, so it reads nil" }
      : undefined;
  }
  const check = checkStartingValue(item, text);
  return check.status === "ok" ? undefined : check;
};

export const valueGroups = (state: StartingValuesViewState): ValueGroup[] => {
  const search = state.search.trim().toLowerCase();
  const matches = (name: string) =>
    !search || name.toLowerCase().includes(search);
  const groups: ValueGroup[] = [];
  const groupOf = (group: ValueGroup["group"]) => {
    let found = groups.find((g) => g.group === group);
    if (!found) {
      found = {
        group,
        label: GROUP_LABELS[group],
        ...(group === "visits" ? { note: "before the scene starts" } : {}),
        rows: [],
      };
      groups.push(found);
    }
    return found;
  };
  const known = new Set<string>();
  for (const item of state.listing?.items ?? []) {
    const rows: ValueRow[] = [];
    for (const [entry, field] of [
      [item, false],
      ...(item.fields ?? []).map((f) => [f, true] as const),
    ] as const) {
      known.add(entry.key);
      const draft = state.drafts[entry.key];
      const value = state.values[entry.key];
      const text = draft ?? value;
      rows.push({
        key: entry.key,
        name: entry.name,
        ...(entry.line !== undefined && entry.key.startsWith("place:")
          ? { line: entry.line + 1 }
          : {}),
        field,
        text: text ?? "",
        first: entry.first,
        ...(value !== undefined ? { value } : {}),
        set: value !== undefined,
        badge: badgeOf(entry, text, state),
        item: entry,
        unresolved: false,
      });
    }
    const shown = rows.filter(
      (row, i) => matches(row.name) || (i > 0 && matches(item.name)),
    );
    if (shown.length > 0) {
      groupOf(item.group).rows.push(...shown);
    }
  }
  if (state.listing) {
    for (const [key, value] of Object.entries(state.values)) {
      if (known.has(key)) {
        continue;
      }
      const name = unresolvedName(key);
      if (!matches(name)) {
        continue;
      }
      groupOf("unresolved").rows.push({
        key,
        name,
        field: false,
        text: value,
        first: "",
        value,
        set: true,
        badge: { status: "warning", message: unresolvedMessage(key) },
        unresolved: true,
      });
    }
  }
  return groups;
};

export const valuesSet = (state: StartingValuesViewState): number => {
  if (!state.listing) {
    return Object.keys(state.values).length;
  }
  const listed = new Set(listingItems(state.listing).map((item) => item.key));
  return Object.keys(state.values).filter((key) => listed.has(key)).length;
};

export const valuesOffered = (state: StartingValuesViewState): number =>
  listingItems(state.listing).length;

export const valuesStatus = (state: StartingValuesViewState): string =>
  `${valuesSet(state)} of ${valuesOffered(state)} values set`;

export const valuesTabIcon = (
  state: StartingValuesViewState,
): "sliders" | "warning" | "error" => {
  const rows = valueGroups({ ...state, search: "" }).flatMap((g) => g.rows);
  if (rows.some((row) => row.badge?.status === "error")) {
    return "error";
  }
  if (rows.some((row) => row.badge?.status === "warning")) {
    return "warning";
  }
  return "sliders";
};

export const fieldChange = (
  state: StartingValuesViewState,
  key: string,
  text: string,
  item?: StartingValueItem,
): { kind: "set"; value: string } | { kind: "clear" } | { kind: "keep" } | { kind: "invalid" } => {
  const trimmed = text.trim();
  if (trimmed === "") {
    return state.values[key] === undefined ? { kind: "keep" } : { kind: "clear" };
  }
  if (
    !parseLiteral(trimmed).ok ||
    (item && checkStartingValue(item, trimmed).status === "error")
  ) {
    return { kind: "invalid" };
  }
  return state.values[key] === trimmed
    ? { kind: "keep" }
    : { kind: "set", value: trimmed };
};
