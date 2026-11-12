import {
  CONSOLE_SEVERITIES,
  consoleLocation,
  countBySeverity,
  formatConsoleLog,
  type ConsoleEntry,
  type ConsoleSeverity,
} from "@impower/spark-web-player/src/components/PlayerConsole/consoleEntries";
import {
  fixActionsOf,
  type DiagnosticFixAction,
} from "@impower/codemirror-vscode-lsp-client/src/diagnostics";
import { FIX_SNAPSHOT_PROOFS } from "@impower/spark-editor-protocol/src/utils/fixSnapshots";
import type { ReadonlySignal } from "@preact/signals";
import type { Diagnostic, Range } from "vscode-languageserver-protocol";

export type { ConsoleEntry, ConsoleSeverity };
export { CONSOLE_SEVERITIES, consoleLocation, countBySeverity, formatConsoleLog };

export interface Problem {
  key: string;
  uri: string;
  path: string;
  script: string;
  severity: ConsoleSeverity;
  title: string;
  message: string;
  line: number;
  range: Range;
  version?: number;
  actions: DiagnosticFixAction[];
}

export type { DiagnosticFixAction };

export interface PlayedInput extends ConsoleEntry {
  checkpoint?: number;
}

export interface PlayedEntry extends PlayedInput {
  id: number;
  time: number;
  uri?: string;
  run?: number;
}

export type PanelCard = "script" | "played";

export type DebugCard = "variables" | "watch" | "callStack";

export type CardName = PanelCard | DebugCard;

export type PanelRow =
  | { kind: "head"; card: PanelCard }
  | { kind: "heading"; path: string; script: string }
  | { kind: "problem"; problem: Problem }
  | { kind: "played"; entry: PlayedEntry }
  | { kind: "empty"; card: PanelCard; text: string }
  | { kind: "end"; card: PanelCard };

export const PLAYED_LIMIT = 100;

const MAIN_SCRIPT = "main.sd";

const SEVERITY_OF: Readonly<Record<number, ConsoleSeverity>> = {
  1: "error",
  2: "warning",
  3: "info",
  4: "info",
};

const WORD: Readonly<Record<ConsoleSeverity, string>> = {
  error: "error",
  warning: "warning",
  info: "note",
};

export const SCRIPT_PREFIX: Readonly<Record<ConsoleSeverity, string>> = {
  error: "Error · ",
  warning: "Warning · ",
  info: "Note · ",
};

export const PLAYED_PREFIX: Readonly<Record<ConsoleSeverity, string>> = {
  error: "Error · ",
  warning: "Warning · ",
  info: "",
};

export const CARD_TITLE: Readonly<Record<PanelCard, string>> = {
  script: "In the script",
  played: "While playing",
};

export const EMPTY_TEXT: Readonly<Record<PanelCard, string>> = {
  script: "No problems.",
  played: "Nothing yet. Play the story and logs will appear here.",
};

export const ALL_HIDDEN_TEXT = "Every kind is hidden. Turn one on above.";

export const severityOf = (diagnostic: { severity?: number }) =>
  SEVERITY_OF[diagnostic.severity ?? 1] ?? "info";

export const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

export const projectPath = (uri: string) => {
  const scheme = uri.indexOf("://");
  const root = scheme < 0 ? -1 : uri.indexOf("/", scheme + 3);
  return root < 0 ? uri : uri.slice(root + 1);
};

export const scriptTitle = (path: string) => {
  if (path === MAIN_SCRIPT) {
    return "Main";
  }
  const file = path.slice(path.lastIndexOf("/") + 1);
  const dot = file.lastIndexOf(".");
  return dot > 0 ? file.slice(0, dot) : file;
};

export const splitMessage = (text: string) => {
  const lines = text.trim().split(/\r?\n/);
  return {
    title: lines[0]!.trim(),
    message: lines.slice(1).join("\n").trim(),
  };
};

const scriptOrder = (a: string, b: string) =>
  a === b
    ? 0
    : a === MAIN_SCRIPT
      ? -1
      : b === MAIN_SCRIPT
        ? 1
        : a.localeCompare(b);

export function toProblems(
  diagnostics: Readonly<Record<string, readonly Diagnostic[]>>,
  versions: Readonly<Record<string, number>> = {},
): Problem[] {
  const problems: Problem[] = [];
  for (const [uri, list] of Object.entries(diagnostics)) {
    const path = projectPath(uri);
    const script = scriptTitle(path);
    list.forEach((diagnostic, index) => {
      problems.push({
        key: `${uri}#${index}`,
        uri,
        path,
        script,
        severity: severityOf(diagnostic),
        ...splitMessage(
          typeof diagnostic.message === "string"
            ? diagnostic.message
            : diagnostic.message.value,
        ),
        line: diagnostic.range.start.line + 1,
        range: diagnostic.range,
        version: versions[uri],
        actions: fixActionsOf(diagnostic.data),
      });
    });
  }
  return problems.sort(
    (a, b) =>
      scriptOrder(a.path, b.path) ||
      a.range.start.line - b.range.start.line ||
      a.range.start.character - b.range.start.character,
  );
}

export function groupByScript<T extends { path: string }>(items: readonly T[]) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const group = groups.get(item.path);
    if (group) {
      group.push(item);
    } else {
      groups.set(item.path, [item]);
    }
  }
  return [...groups].map(([path, entries]) => ({ path, entries }));
}

export function headCount(items: readonly { severity: ConsoleSeverity }[]) {
  const { error, warning, info } = countBySeverity(items);
  const parts = [
    error + warning ? plural(error + warning, "problem") : "",
    info ? plural(info, "note") : "",
  ].filter(Boolean);
  return {
    text: parts.length ? `(${parts.join(" · ")})` : "",
    spoken: parts.join(" and "),
  };
}

export function problemSummary(items: readonly { severity: ConsoleSeverity }[]) {
  const counts = countBySeverity(items);
  return CONSOLE_SEVERITIES.map((severity) =>
    counts[severity] ? plural(counts[severity], WORD[severity]) : "",
  )
    .filter(Boolean)
    .join(", ");
}

export function filterChip(
  severity: ConsoleSeverity,
  count: number,
  pressed: boolean,
) {
  const text = plural(count, WORD[severity]);
  const title = `${pressed ? "Hide" : "Show"} ${WORD[severity]}s`;
  return { text, title, label: `${text}. ${title}` };
}

export const lineLink = (line: number) => `Line ${line}`;

export function fixChoiceOf(problem: Problem, action: DiagnosticFixAction) {
  const { name, done, expect, kind, changes } = action;
  return {
    fix: {
      uri: problem.uri,
      version: problem.version,
      range: problem.range,
      changes,
      expect,
      kind,
    },
    name,
    done,
  };
}

export function playedFromRuntimeError(
  params: {
    message: string;
    type: number;
    location?: { uri: string; range: Range };
  },
): ConsoleEntry {
  const { title, message } = splitMessage(params.message);
  const uri = params.location?.uri;
  return {
    severity: severityOf({ severity: params.type }),
    title,
    message,
    path: uri ? projectPath(uri) : undefined,
    line: params.location ? params.location.range.start.line + 1 : undefined,
  };
}

export function playedFromChoice(params: {
  checkpoint: number;
  text?: string;
}): PlayedInput {
  const option = (params.text ?? "").trim().split(/\r?\n/)[0]!.trim();
  return {
    severity: "info",
    title: option ? `Chose · ${option}` : "Chose an option",
    message: "",
    checkpoint: params.checkpoint,
  };
}

export const isChoiceEntry = (entry: { checkpoint?: number }) =>
  entry.checkpoint != null;

export const playedMessages = <T extends { checkpoint?: number }>(
  played: readonly T[],
) => played.filter((entry) => !isChoiceEntry(entry));

export function isChoiceLive(
  entry: Pick<PlayedEntry, "id" | "run" | "checkpoint">,
  played: readonly Pick<PlayedEntry, "id" | "run" | "checkpoint">[],
  run: number,
  held?: readonly number[] | null,
) {
  if (entry.checkpoint == null || entry.run !== run) {
    return false;
  }
  if (held && !held.includes(entry.checkpoint)) {
    return false;
  }
  return !played.some(
    (later) =>
      later.id > entry.id &&
      later.run === entry.run &&
      later.checkpoint != null &&
      later.checkpoint <= entry.checkpoint!,
  );
}

export function panelRows({
  problems,
  played,
  shown,
  open,
}: {
  problems: readonly Problem[];
  played: readonly PlayedEntry[];
  shown: Readonly<Record<ConsoleSeverity, boolean>>;
  open: Readonly<Record<PanelCard, boolean>>;
}): PanelRow[] {
  const rows: PanelRow[] = [];
  rows.push({ kind: "head", card: "script" });
  if (open.script) {
    const visible = problems.filter((problem) => shown[problem.severity]);
    if (visible.length) {
      for (const group of groupByScript(visible)) {
        rows.push({
          kind: "heading",
          path: group.path,
          script: group.entries[0]!.script,
        });
        for (const problem of group.entries) {
          rows.push({ kind: "problem", problem });
        }
      }
    } else {
      rows.push(emptyRow("script", problems.length));
    }
    rows.push({ kind: "end", card: "script" });
  }
  rows.push(...playedRows({ played, shown, open: open.played }));
  return rows;
}

export function playedRows({
  played,
  shown,
  open,
}: {
  played: readonly PlayedEntry[];
  shown: Readonly<Record<ConsoleSeverity, boolean>>;
  open: boolean;
}): PanelRow[] {
  const rows: PanelRow[] = [{ kind: "head", card: "played" }];
  if (!open) {
    return rows;
  }
  const visible = played.filter(
    (entry) => isChoiceEntry(entry) || shown[entry.severity],
  );
  if (visible.length) {
    for (const entry of visible) {
      rows.push({ kind: "played", entry });
    }
  } else {
    rows.push(emptyRow("played", played.length));
  }
  rows.push({ kind: "end", card: "played" });
  return rows;
}

const emptyRow = (card: PanelCard, total: number): PanelRow => ({
  kind: "empty",
  card,
  text: total ? ALL_HIDDEN_TEXT : EMPTY_TEXT[card],
});

export type ProblemsScope =
  | { kind: "story" }
  | { kind: "script"; path: string }
  | {
      kind: "outline";
      uri: string;
      label: string;
      diagnostics: ReadonlySignal<readonly Diagnostic[]>;
    };

export interface PublishedDiagnostics {
  diagnostics: Readonly<Record<string, readonly Diagnostic[]>>;
  versions: Readonly<Record<string, number>>;
}

const publishedVersion = (
  uri: string,
  diagnostics: readonly Diagnostic[],
  published?: PublishedDiagnostics,
) =>
  FIX_SNAPSHOT_PROOFS.outlineScope.holds({
    row: diagnostics,
    published: published?.diagnostics[uri] ?? [],
  })
    ? published?.versions[uri]
    : undefined;

export function scopedProblems(
  scope: ProblemsScope,
  all: readonly Problem[],
  published?: PublishedDiagnostics,
): readonly Problem[] {
  if (scope.kind === "story") {
    return all;
  }
  if (scope.kind === "script") {
    return all.filter((problem) => problem.path === scope.path);
  }
  const diagnostics = scope.diagnostics.value;
  const version = publishedVersion(scope.uri, diagnostics, published);
  return toProblems(
    { [scope.uri]: diagnostics },
    version === undefined ? {} : { [scope.uri]: version },
  );
}

export function scopeContext(scope: ProblemsScope) {
  if (scope.kind === "story") {
    return "Whole story";
  }
  if (scope.kind === "script") {
    return scriptTitle(scope.path);
  }
  return scope.label;
}
