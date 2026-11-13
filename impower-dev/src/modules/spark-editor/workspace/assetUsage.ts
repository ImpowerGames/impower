import { storyOrder, UNREACHED, type Reference } from "../utils/fileListModel";

export type AssetUseRole = "backdrop" | "portrait" | "sound" | "music" | "font" | "define" | "other";

export interface AssetUse {
  uri: string;
  path: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  role: AssetUseRole;
  roles?: readonly AssetUseRole[];
  text: string;
}

export interface AssetUsage {
  projectId: string;
  version: number | undefined;
  uses: Readonly<Record<string, readonly AssetUse[]>>;
  order: readonly string[];
}

export const USE_ROLE_LABELS: Record<AssetUseRole, string> = {
  backdrop: "Backdrop",
  portrait: "Portrait",
  music: "Music",
  sound: "Sound",
  font: "Style font",
  define: "Define",
  other: "Other",
};

const ROLE_ORDER = Object.keys(USE_ROLE_LABELS) as AssetUseRole[];

export const usageOf = (
  projectId: string,
  answer: {
    version: number | undefined;
    uses: Record<string, Omit<AssetUse, "path">[]>;
    scripts: { from: string; to: string; divert: boolean }[];
  },
  pathOf: (uri: string) => string,
  main: string,
): AssetUsage => {
  const uses: Record<string, AssetUse[]> = {};
  for (const [uri, list] of Object.entries(answer.uses)) {
    uses[pathOf(uri)] = onePerLine(list.map((use) => ({ ...use, path: pathOf(use.uri) })));
  }
  const references: Reference[] = answer.scripts.map((r) => ({
    from: pathOf(r.from),
    to: pathOf(r.to),
    divert: r.divert,
  }));
  return { projectId, version: answer.version, uses, order: storyOrder(main, references) };
};

const rolesOf = (use: AssetUse): readonly AssetUseRole[] => use.roles ?? [use.role];

const onePerLine = (uses: Iterable<AssetUse>): AssetUse[] => {
  const kept = new Map<string, number>();
  const result: AssetUse[] = [];
  for (const use of uses) {
    const key = `${use.uri}:${use.range.start.line}`;
    const at = kept.get(key);
    if (at === undefined) {
      kept.set(key, result.length);
      result.push(use);
      continue;
    }
    const first = result[at]!;
    const roles = rolesOf(first);
    const added = rolesOf(use).filter((role) => !roles.includes(role));
    if (added.length) {
      result[at] = { ...first, roles: [...roles, ...added] };
    }
  }
  return result;
};

export const usesOf = (usage: AssetUsage, paths: readonly string[]): AssetUse[] => {
  const [only] = paths;
  if (paths.length === 1 && only !== undefined) {
    return [...(usage.uses[only] ?? [])];
  }
  return onePerLine(paths.flatMap((path) => usage.uses[path] ?? []));
};

const LINE_SPAN = 1_000_000;
const SCRIPT_SPAN = LINE_SPAN * 1_000_000;

export const storyPlace = (usage: AssetUsage) => {
  const rank = new Map(usage.order.map((path, index) => [path, index]));
  return (uses: readonly AssetUse[]): number => {
    let best = UNREACHED;
    for (const use of uses) {
      const script = rank.get(use.path);
      if (script === undefined) {
        continue;
      }
      const place =
        script * SCRIPT_SPAN +
        Math.min(use.range.start.line, LINE_SPAN - 1) * LINE_SPAN +
        Math.min(use.range.start.character, LINE_SPAN - 1);
      if (place < best) {
        best = place;
      }
    }
    return best;
  };
};

export const usedAs = (uses: readonly AssetUse[]): string[] => {
  const roles = new Set(uses.flatMap(rolesOf));
  return ROLE_ORDER.filter((role) => roles.has(role)).map((role) => USE_ROLE_LABELS[role]);
};

export const usesLabel = (count: number): string =>
  count === 0 ? "unused" : `${count} ${count === 1 ? "use" : "uses"}`;
