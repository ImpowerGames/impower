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

/** The panel's tabs. */
export type RouteTab = "route" | "values";

/** A field's badge: a warning or an error, with the message its popup
 *  shows. */
export interface ValueBadge {
  status: "warning" | "error";
  message: string;
}

/**
 * Everything the Starting values tab shows, which it renders from and
 * nothing else: what the start can take (`listing`), the values set for it,
 * the text a field holds while it is not a value yet, the fields whose
 * change the host did not keep, and the search.
 */
export interface StartingValuesViewState {
  /** The start the values are for: a scene's qualified name, or `"0"`. */
  start?: string;
  listing?: StartingValueListing;
  values: StartingValueSet;
  /** What a field holds that is not kept: text that does not parse. */
  drafts: Record<string, string>;
  /** The fields whose change the host did not keep, each with the value it
   *  is back to. */
  unsaved: Record<string, string>;
  search: string;
}

export const emptyValuesState = (): StartingValuesViewState => ({
  values: {},
  drafts: {},
  unsaved: {},
  search: "",
});

/** One row of the tab. */
export interface ValueRow {
  key: string;
  name: string;
  /** A place's line, counting from 1. */
  line?: number;
  /** A table store's field, indented under its store. */
  field: boolean;
  /** The field's text: what is set or typed, or empty for the first value,
   *  which shows in grey. */
  text: string;
  first: string;
  /** The value set, as the host keeps it. */
  value?: string;
  set: boolean;
  badge?: ValueBadge;
  /** A value whose name or line left the script. */
  unresolved: boolean;
}

export interface ValueGroup {
  group: StartingValueGroup | "unresolved";
  label: string;
  /** What the heading adds in grey. */
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

/** The groups of the tab in order, each with its rows in script order, those
 *  the search leaves out left out, and the values whose names left the
 *  script last. */
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

/** How many values are set for the start among what it can take: a value
 *  whose name left the script is not counted, as the route ignores it. */
export const valuesSet = (state: StartingValuesViewState): number => {
  if (!state.listing) {
    return Object.keys(state.values).length;
  }
  const listed = new Set(listingItems(state.listing).map((item) => item.key));
  return Object.keys(state.values).filter((key) => listed.has(key)).length;
};

/** How many things the start can take. */
export const valuesOffered = (state: StartingValuesViewState): number =>
  listingItems(state.listing).length;

/** The status line: always there, so nothing below it moves. */
export const valuesStatus = (state: StartingValuesViewState): string =>
  `${valuesSet(state)} of ${valuesOffered(state)} values set`;

/** The tab's icon: the sliders, the warning icon while any field shows a
 *  warning, or the error icon while any field shows an error. Read from
 *  every row, the search aside. */
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

/** What a field's text asks of the host when the author is done with it:
 *  to set the value, to clear it, or nothing, when it is what is set already
 *  or is not a value yet. */
export const fieldChange = (
  state: StartingValuesViewState,
  key: string,
  text: string,
): { kind: "set"; value: string } | { kind: "clear" } | { kind: "keep" } | { kind: "invalid" } => {
  const trimmed = text.trim();
  if (trimmed === "") {
    return state.values[key] === undefined ? { kind: "keep" } : { kind: "clear" };
  }
  if (!parseLiteral(trimmed).ok) {
    return { kind: "invalid" };
  }
  return state.values[key] === trimmed
    ? { kind: "keep" }
    : { kind: "set", value: trimmed };
};
