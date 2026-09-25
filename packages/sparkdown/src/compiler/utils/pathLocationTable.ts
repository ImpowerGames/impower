import type {
  FunctionSpan,
  PathLocationTable,
  ScriptLocation,
} from "../types/SparkProgram";

/** Numbers per row of {@link PathLocationTable.values}. */
export const LOCATION_STRIDE = 5;

export const EMPTY_PATH_LOCATION_TABLE: PathLocationTable = {
  paths: [],
  values: new Int32Array(0),
};

/** Rows of a table, by path. Built the first time a caller looks a path up, so
 *  a program that is only previewed (line resolution, which needs no such
 *  lookup) never pays for one. */
const rowsByPath = new WeakMap<PathLocationTable, Map<string, number>>();

const rowsOf = (table: PathLocationTable) => {
  let rows = rowsByPath.get(table);
  if (!rows) {
    rows = new Map();
    const { paths } = table;
    for (let i = 0; i < paths.length; i++) {
      rows.set(paths[i]!, i);
    }
    rowsByPath.set(table, rows);
  }
  return rows;
};

/** Whether a by-path lookup has already built this table's row index. */
export const pathIndexBuilt = (table: PathLocationTable | undefined) =>
  table != null && rowsByPath.has(table);

export const pathLocationCount = (table: PathLocationTable | undefined) =>
  table?.paths.length ?? 0;

/** The row `path` occupies, or -1. */
export const pathLocationRow = (
  table: PathLocationTable | undefined,
  path: string | null | undefined,
) => {
  if (!table || path == null) {
    return -1;
  }
  return rowsOf(table).get(path) ?? -1;
};

export const hasPathLocation = (
  table: PathLocationTable | undefined,
  path: string | null | undefined,
) => pathLocationRow(table, path) >= 0;

export const pathAtRow = (
  table: PathLocationTable | undefined,
  row: number,
): string | undefined => table?.paths[row];

export const locationAtRow = (
  table: PathLocationTable | undefined,
  row: number,
): ScriptLocation | undefined => {
  if (!table || row < 0 || row >= table.paths.length) {
    return undefined;
  }
  const at = row * LOCATION_STRIDE;
  const v = table.values;
  return [v[at]!, v[at + 1]!, v[at + 2]!, v[at + 3]!, v[at + 4]!];
};

/** The source range recorded for `path`, or undefined. */
export const pathLocation = (
  table: PathLocationTable | undefined,
  path: string | null | undefined,
): ScriptLocation | undefined =>
  locationAtRow(table, pathLocationRow(table, path));

export const scriptIndexAtRow = (table: PathLocationTable, row: number) =>
  table.values[row * LOCATION_STRIDE]!;

export const startLineAtRow = (table: PathLocationTable, row: number) =>
  table.values[row * LOCATION_STRIDE + 1]!;

/**
 * What a line lookup searches: the rows it may answer with, where each script
 * begins among them, and the running greatest end line within each script.
 *
 * The rows of a script are ordered by start line, so the rows that start at or
 * before a line are a prefix of the script — but the row that *contains* the
 * line can be any of them, because a container's range spans its children's.
 * `maxEndLine` is non-decreasing within a script, so the first row of that
 * prefix whose `maxEndLine` reaches the line is the first row that contains
 * it, and a binary search finds it.
 */
interface PathSearchIndex {
  rows: Int32Array;
  scriptStarts: Int32Array;
  maxEndLine: Int32Array;
}

const buildSearchIndex = (
  table: PathLocationTable,
  include?: (row: number) => boolean,
): PathSearchIndex => {
  const { paths, values } = table;
  const total = paths.length;
  let scriptCount = 0;
  for (let i = 0; i < total; i++) {
    const scriptIndex = values[i * LOCATION_STRIDE]!;
    if (scriptIndex + 1 > scriptCount) {
      scriptCount = scriptIndex + 1;
    }
  }
  let rows = new Int32Array(total);
  let count = 0;
  for (let i = 0; i < total; i++) {
    if (!include || include(i)) {
      rows[count++] = i;
    }
  }
  if (count < total) {
    rows = rows.slice(0, count);
  }
  const scriptStarts = new Int32Array(scriptCount + 1);
  for (let p = 0; p < count; p++) {
    const bucket = values[rows[p]! * LOCATION_STRIDE]! + 1;
    scriptStarts[bucket] = scriptStarts[bucket]! + 1;
  }
  for (let s = 1; s < scriptStarts.length; s++) {
    scriptStarts[s] = scriptStarts[s]! + scriptStarts[s - 1]!;
  }
  const maxEndLine = new Int32Array(count);
  let currentScript = -1;
  let running = 0;
  for (let p = 0; p < count; p++) {
    const at = rows[p]! * LOCATION_STRIDE;
    const scriptIndex = values[at]!;
    const endLine = values[at + 3]!;
    if (scriptIndex !== currentScript) {
      currentScript = scriptIndex;
      running = endLine;
    } else if (endLine > running) {
      running = endLine;
    }
    maxEndLine[p] = running;
  }
  return { rows, scriptStarts, maxEndLine };
};

/**
 * Reactive-binding evaluators (`__binding_<offset>`) are synthetic ink
 * FUNCTIONS the compiler hoists for `{interpolations}` and `@event` handlers.
 * They carry debug metadata (so diagnostics can point at the binding source),
 * which also lists them here as candidate paths — but a preview DIVERTS into
 * its closest path (`ChoosePathString`), and diverting into a function runs
 * its `return` outside a call context ("Found function return statement, when
 * expected end of flow"). A UI-only screen (all its paths are bindings) would
 * otherwise jump straight into one and fail to mount. They are never a valid
 * preview target, so exclude them as candidates.
 */
export const isBindingPath = (path: string) =>
  path.includes("__binding_") &&
  path.split(".").some((seg) => seg.startsWith("__binding_"));

/**
 * Whether a row may be where a story starts or a preview diverts: not a
 * binding evaluator, and not function code, a row under one of the table's
 * {@link PathLocationTable.functions} that starts within the function's own
 * lines. Starting inside a function runs its body as story, so its `return`
 * ends the run on a runtime error before anything shows; a line that holds only
 * function rows (a `function` header, a `store` whose value is a function
 * literal) resolves instead to the story row after it.
 */
const previewableRowTest = (table: PathLocationTable) => {
  const { paths, values } = table;
  const functions = table.functions?.length
    ? new Map(table.functions.map((f) => [f.path, f.lines]))
    : undefined;
  const inFunction = (path: string, row: number) => {
    const at = row * LOCATION_STRIDE;
    for (let dot = path.indexOf("."); ; dot = path.indexOf(".", dot + 1)) {
      const container = dot < 0 ? path : path.slice(0, dot);
      if (functions!.has(container)) {
        const lines = functions!.get(container);
        if (
          !lines ||
          (values[at] === lines[0] &&
            values[at + 1]! >= lines[1] &&
            values[at + 1]! <= lines[2])
        ) {
          return true;
        }
      }
      if (dot < 0) {
        return false;
      }
    }
  };
  return (row: number) => {
    const path = paths[row]!;
    if (isBindingPath(path)) {
      return false;
    }
    return !functions || !inFunction(path, row);
  };
};

const fullIndexes = new WeakMap<PathLocationTable, PathSearchIndex>();
const previewableIndexes = new WeakMap<PathLocationTable, PathSearchIndex>();

const searchIndexOf = (table: PathLocationTable, previewableOnly: boolean) => {
  const cache = previewableOnly ? previewableIndexes : fullIndexes;
  let index = cache.get(table);
  if (!index) {
    index = buildSearchIndex(
      table,
      previewableOnly ? previewableRowTest(table) : undefined,
    );
    cache.set(table, index);
  }
  return index;
};

/**
 * The row of `scriptIndex` that owns `line`: the first row whose range covers
 * it, or, when no range does, the first row that starts after it. -1 when the
 * script has no row at or after the line.
 *
 * A line that `>` breaks holds several beats, each a run of rows sharing its
 * start. `"first"` answers with the first row that covers the line, where
 * PLAY from the line starts, and `"last"` with the first row of the last beat
 * that starts on the line, the beat a preview of the line shows. The two
 * agree on a line where at most one beat starts.
 */
export const findPathRow = (
  table: PathLocationTable | undefined,
  scriptIndex: number,
  line: number,
  previewableOnly: boolean,
  beat: "first" | "last" = "first",
) => {
  if (!table || scriptIndex < 0 || line == null) {
    return -1;
  }
  const { rows, scriptStarts, maxEndLine } = searchIndexOf(
    table,
    previewableOnly,
  );
  if (scriptIndex + 1 >= scriptStarts.length) {
    return -1;
  }
  const start = scriptStarts[scriptIndex]!;
  const end = scriptStarts[scriptIndex + 1]!;
  if (start >= end) {
    return -1;
  }
  const values = table.values;
  // The first row of the script that starts after `line`.
  let lo = start;
  let hi = end;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (values[rows[mid]! * LOCATION_STRIDE + 1]! <= line) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  const after = lo;
  // Rows are ordered by start line and then column, so the rows that start
  // on the line end at `after - 1`. A beat is a run of rows with the same
  // start, so the last beat begins at the first row of the last run.
  if (
    beat === "last" &&
    after > start &&
    values[rows[after - 1]! * LOCATION_STRIDE + 1]! === line
  ) {
    const column = values[rows[after - 1]! * LOCATION_STRIDE + 2]!;
    let p = after - 1;
    while (
      p > start &&
      values[rows[p - 1]! * LOCATION_STRIDE + 1]! === line &&
      values[rows[p - 1]! * LOCATION_STRIDE + 2]! === column
    ) {
      p--;
    }
    return rows[p]!;
  }
  if (after > start && maxEndLine[after - 1]! >= line) {
    let a = start;
    let b = after - 1;
    while (a < b) {
      const mid = (a + b) >> 1;
      if (maxEndLine[mid]! >= line) {
        b = mid;
      } else {
        a = mid + 1;
      }
    }
    return rows[a]!;
  }
  return after < end ? rows[after]! : -1;
};

/** The first row whose script index is at least `scriptIndex`. */
const lowerBoundOfScript = (table: PathLocationTable, scriptIndex: number) => {
  const { values } = table;
  let lo = 0;
  let hi = table.paths.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (values[mid * LOCATION_STRIDE]! < scriptIndex) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
};

/** The half-open row range `[start, end)` that `scriptIndex` occupies. The
 *  rows are grouped by script, so both ends are a binary search away. */
export const scriptRowRange = (
  table: PathLocationTable | undefined,
  scriptIndex: number,
): [start: number, end: number] => {
  if (!table || scriptIndex < 0) {
    return [0, 0];
  }
  return [
    lowerBoundOfScript(table, scriptIndex),
    lowerBoundOfScript(table, scriptIndex + 1),
  ];
};

/**
 * The same paths, each as its own characters.
 *
 * The compiler builds a path by joining its components, and the engine keeps
 * such a string as a reference to the pieces it was made of rather than as one
 * run of characters. Cloning one of those across the worker boundary costs
 * more than cloning the characters, and copying the string materializes them.
 * Measured on the Raffles and Bunny project, 10,603 paths over 187,176
 * characters: 237 KB as the compiler leaves them, 204 KB copied. The copy is a
 * pass of its own because, folded into the loop that fills the array, it is
 * optimized away and the strings stay as they were.
 */
export const narrowPaths = (paths: string[]) =>
  paths.map((path) => path.slice(0));

/** A table of `locations`, ordered by script, then start line, then start
 *  column — the order a lookup searches, carrying `functions` when there are
 *  any. */
export const pathLocationTableOf = (
  locations: Record<string, ScriptLocation> | undefined,
  functions?: FunctionSpan[],
): PathLocationTable => {
  const entries = Object.entries(locations ?? {});
  entries.sort(
    (a, b) =>
      a[1][0] - b[1][0] || a[1][1] - b[1][1] || a[1][2] - b[1][2],
  );
  const paths = new Array<string>(entries.length);
  const values = new Int32Array(entries.length * LOCATION_STRIDE);
  for (let i = 0; i < entries.length; i++) {
    const [path, location] = entries[i]!;
    paths[i] = path;
    const at = i * LOCATION_STRIDE;
    values[at] = location[0];
    values[at + 1] = location[1];
    values[at + 2] = location[2];
    values[at + 3] = location[3];
    values[at + 4] = location[4];
  }
  return functions?.length
    ? { paths: narrowPaths(paths), values, functions }
    : { paths: narrowPaths(paths), values };
};

/**
 * A table as a JSON transport delivers it, where the typed array of values
 * arrives as a plain object keyed by position. Restores the typed array; a
 * table that still has one is returned as it is.
 */
export const asPathLocationTable = (
  raw: unknown,
): PathLocationTable | undefined => {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const { paths, values, functions } = raw as {
    paths?: unknown;
    values?: ArrayLike<number>;
    functions?: FunctionSpan[];
  };
  if (!Array.isArray(paths)) {
    return undefined;
  }
  if (values instanceof Int32Array) {
    return raw as PathLocationTable;
  }
  const restored = new Int32Array(paths.length * LOCATION_STRIDE);
  for (let i = 0; i < restored.length; i++) {
    restored[i] = Number(values?.[i] ?? 0);
  }
  return functions
    ? { paths: paths as string[], values: restored, functions }
    : { paths: paths as string[], values: restored };
};
