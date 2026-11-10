export type SortField = "name" | "modified" | "size" | "uses" | "story";
export type SortDirection = "asc" | "desc";
export type SortIcon = "sort" | "clock" | "size" | "uses" | "story";

export interface SortFieldSpec {
  field: SortField;
  label: string;
  icon: SortIcon;
  asc: string;
  desc: string;
  first: SortDirection;
}

export const SORT_FIELDS: readonly SortFieldSpec[] = [
  { field: "name", label: "Name", icon: "sort", asc: "A to Z", desc: "Z to A", first: "asc" },
  { field: "modified", label: "Modified", icon: "clock", asc: "Oldest first", desc: "Newest first", first: "desc" },
  { field: "size", label: "Size", icon: "size", asc: "Smallest first", desc: "Largest first", first: "desc" },
  { field: "uses", label: "Uses", icon: "uses", asc: "Least used first", desc: "Most used first", first: "desc" },
  { field: "story", label: "Story order", icon: "story", asc: "By first reached", desc: "By last reached", first: "asc" },
];

export interface SortSpec {
  field: SortField;
  direction: SortDirection;
}

const specOf = (field: SortField): SortFieldSpec =>
  SORT_FIELDS.find((spec) => spec.field === field)!;

export const parseSort = (value: unknown): SortSpec => {
  if (value === "asc" || value === "desc") {
    return { field: "name", direction: value };
  }
  if (value === "story") {
    return { field: "story", direction: "asc" };
  }
  const [field, direction] = String(value ?? "").split("-");
  const spec = SORT_FIELDS.find((s) => s.field === field);
  if (!spec) {
    return { field: "name", direction: "asc" };
  }
  return {
    field: spec.field,
    direction: direction === "asc" || direction === "desc" ? direction : spec.first,
  };
};

export const sortKey = ({ field, direction }: SortSpec): string =>
  `${field}-${direction}`;

export const sortLabel = (value: unknown) => {
  const { field, direction } = parseSort(value);
  const spec = specOf(field);
  return {
    field,
    direction,
    name: field === "story" ? "Story" : spec.label,
    description: `${spec.label.toLowerCase()}, ${spec[direction].toLowerCase()}`,
  };
};

export const sortMenu = (value: unknown) => {
  const current = parseSort(value);
  const spec = specOf(current.field);
  return {
    fields: SORT_FIELDS.map((f) => ({
      field: f.field,
      label: f.label,
      icon: f.icon,
      checked: f.field === current.field,
      key: sortKey({
        field: f.field,
        direction: f.field === current.field ? current.direction : f.first,
      }),
    })),
    directions: (["asc", "desc"] as const).map((direction) => ({
      direction,
      label: spec[direction],
      checked: direction === current.direction,
      key: sortKey({ field: current.field, direction }),
    })),
  };
};

export const compareNames = (a: string, b: string): number =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

export const UNREACHED = Number.MAX_SAFE_INTEGER;

export interface ListEntry {
  kind: "folder" | "file";
  path: string;
  name: string;
  modified: number;
  size: number;
  uses: number;
  position: number;
  pinned?: boolean;
}

export const compareEntries = (value: unknown) => {
  const { field, direction } = parseSort(value);
  const sign = direction === "desc" ? -1 : 1;
  const byName = (a: ListEntry, b: ListEntry) =>
    compareNames(a.name, b.name) || compareNames(a.path, b.path);
  return (a: ListEntry, b: ListEntry): number => {
    if (!!a.pinned !== !!b.pinned) {
      return a.pinned ? -1 : 1;
    }
    if (a.kind !== b.kind) {
      return a.kind === "folder" ? -1 : 1;
    }
    if (field === "name") {
      return sign * byName(a, b);
    }
    const key =
      field === "story" ? "position" : field === "uses" ? "uses" : field;
    if (a[key] === b[key]) {
      return byName(a, b);
    }
    if (field === "story" && (a.position === UNREACHED || b.position === UNREACHED)) {
      return a.position === UNREACHED ? 1 : -1;
    }
    return sign * (a[key] - b[key]) || byName(a, b);
  };
};

export const sortEntries = <T extends ListEntry>(entries: T[], value: unknown): T[] =>
  [...entries].sort(compareEntries(value));

export const NAME_MESSAGES = {
  empty: "Enter a name.",
  characters: "Use a name without slashes or special file characters.",
  reserved: "Choose a different name. This name is reserved.",
  length: "Keep the name to 120 characters or fewer.",
  taken: "That name is already in use in this folder.",
} as const;

export class NameError extends Error {}

const CONTROL_OR_RESERVED_CHARACTER = /[\\/:*?"<>|\u0000-\u001f]/;

export const validName = (value: string, extension = ""): string => {
  let leaf = value.trim();
  if (extension && leaf.toLowerCase().endsWith(extension.toLowerCase())) {
    leaf = leaf.slice(0, -extension.length);
  }
  if (!leaf || leaf === "." || leaf === "..") {
    throw new NameError(NAME_MESSAGES.empty);
  }
  if (CONTROL_OR_RESERVED_CHARACTER.test(leaf) || /[. ]$/.test(leaf)) {
    throw new NameError(NAME_MESSAGES.characters);
  }
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(leaf)) {
    throw new NameError(NAME_MESSAGES.reserved);
  }
  if (leaf.length > 120) {
    throw new NameError(NAME_MESSAGES.length);
  }
  return leaf + extension;
};

export const availableName = (
  value: string,
  siblings: readonly string[],
  extension = "",
  current?: string,
): string => {
  const leaf = validName(value, extension);
  const taken = siblings.some(
    (name) =>
      name !== current && name.toLowerCase() === leaf.toLowerCase(),
  );
  if (taken) {
    throw new NameError(NAME_MESSAGES.taken);
  }
  return leaf;
};

export const copyName = (
  stem: string,
  siblings: readonly string[],
  extension = "",
): string => {
  const taken = new Set(siblings.map((name) => name.toLowerCase()));
  for (let n = 1; ; n += 1) {
    const leaf = `${stem} copy${n === 1 ? "" : ` ${n}`}${extension}`;
    if (!taken.has(leaf.toLowerCase())) {
      return leaf;
    }
  }
};

export const ago = (
  when: number | undefined,
  now = Date.now(),
  locale?: string,
): string => {
  if (!when) {
    return "";
  }
  const seconds = Math.max(0, Math.round((now - when) / 1000));
  if (seconds < 60) {
    return "just now";
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }
  const days = Math.round(hours / 24);
  if (days < 7) {
    return `${days}d`;
  }
  const date = new Date(when);
  const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (date.getFullYear() !== new Date(now).getFullYear()) {
    options.year = "numeric";
  }
  return date.toLocaleDateString(locale, options);
};

export const bytesLabel = (bytes: number | undefined): string => {
  const n = bytes || 0;
  if (n >= 1048576) {
    return `${(n / 1048576).toFixed(1)} MB`;
  }
  if (n >= 1024) {
    return `${Math.round(n / 1024)} kB`;
  }
  return `${n} B`;
};

export const plural = (count: number, word: string): string =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

export const holdingsLabel = (folders: number, files: number, word: string): string =>
  [folders ? plural(folders, "folder") : "", files ? plural(files, word) : ""]
    .filter(Boolean)
    .join(", ") || "Empty";

export interface RowLineInput {
  entry: ListEntry;
  sort: unknown;
  entryLabel?: string;
  location?: string;
  holdings?: string;
  usesLabel?: (uses: number) => string;
  now?: number;
}

export const rowLine = ({
  entry,
  sort,
  entryLabel,
  location,
  holdings,
  usesLabel,
  now,
}: RowLineInput): string => {
  const byUses = parseSort(sort).field === "uses";
  const folder = entry.kind === "folder";
  const parts: string[] = [];
  if (entry.pinned && entryLabel) {
    parts.push(entryLabel);
  }
  if (location !== undefined) {
    parts.push(location);
  } else if (folder && holdings) {
    parts.push(holdings);
  }
  if (!folder) {
    if (byUses && usesLabel) {
      if (!entry.pinned) {
        parts.push(usesLabel(entry.uses));
      }
    } else {
      const when = ago(entry.modified, now);
      if (when) {
        parts.push(`Modified ${when}`);
      }
      parts.push(bytesLabel(entry.size));
    }
  }
  return parts.filter(Boolean).join(" · ");
};

export interface Reference {
  from: string;
  to: string;
  divert: boolean;
}

export const referenceCounts = (references: readonly Reference[]) => {
  const from = new Map<string, Set<string>>();
  for (const r of references) {
    if (r.from === r.to) {
      continue;
    }
    if (!from.has(r.to)) {
      from.set(r.to, new Set());
    }
    from.get(r.to)!.add(r.from);
  }
  return (path: string): number => from.get(path)?.size ?? 0;
};

export const referencedBy = (
  references: readonly Pick<Reference, "from" | "to">[],
  paths: readonly string[],
): string[] => {
  const within = (path: string) =>
    paths.some((p) => path === p || path.startsWith(`${p}/`));
  const found = new Set<string>();
  for (const r of references) {
    if (within(r.to) && !within(r.from)) {
      found.add(r.from);
    }
  }
  return [...found];
};

export const listSentence = (items: readonly string[]): string =>
  items.length < 2
    ? items.join("")
    : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

export const referencedByLabel = (paths: readonly string[]): string =>
  `Referenced by ${listSentence(paths.map((p) => p.split("/").pop() ?? p))}`;

export const storyOrder = (
  entry: string,
  references: readonly Reference[],
): string[] => {
  const diverts = new Map<string, string[]>();
  for (const r of references) {
    if (r.divert) {
      if (!diverts.has(r.from)) {
        diverts.set(r.from, []);
      }
      diverts.get(r.from)!.push(r.to);
    }
  }
  const order: string[] = [];
  const reached = new Set<string>();
  const visit = (path: string) => {
    if (reached.has(path)) {
      return;
    }
    reached.add(path);
    order.push(path);
    for (const next of diverts.get(path) ?? []) {
      visit(next);
    }
  };
  visit(entry);
  return order;
};

export const storyPositions = (order: readonly string[]) => {
  const index = new Map(order.map((path, i) => [path, i]));
  return (path: string, kind: ListEntry["kind"]): number => {
    if (kind === "file") {
      return index.get(path) ?? UNREACHED;
    }
    let best = UNREACHED;
    for (const [p, i] of index) {
      if (p.startsWith(`${path}/`) && i < best) {
        best = i;
      }
    }
    return best;
  };
};
