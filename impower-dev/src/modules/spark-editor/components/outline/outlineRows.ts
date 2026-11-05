import {
  countProblems,
  countSymbolProblems,
  type ProblemCounts,
} from "@impower/codemirror-vscode-lsp-client/src/symbolProblems";
import type {
  Diagnostic,
  DocumentSymbol,
  Position,
  Range,
} from "vscode-languageserver-protocol";

export type OutlineKind = "setup" | "scene" | "choose" | "branch";

export type OutlineDepth = 0 | 1 | 2 | 3;

export type OutlineCurrent = "none" | "self" | "ancestor";

export interface OutlineRow {
  key: string;
  kind: OutlineKind;
  label: string;
  accessibleName: string;
  depth: OutlineDepth;
  selection: Range;
  problems: ProblemCounts;
  current: OutlineCurrent;
  scene?: string;
  expanded?: boolean;
}

export interface OutlineModel {
  rows: OutlineRow[];
  currentIndex: number;
  problems: ProblemCounts;
}

export interface OutlineInput {
  symbols: readonly DocumentSymbol[];
  diagnostics: readonly Diagnostic[];
  caret?: Position;
  collapsed?: readonly string[];
  firstContentLine?: number;
}

const CLASS = 5;
const ENUM = 10;
const INTERFACE = 11;

const KIND_OF: Partial<Record<number, OutlineKind>> = {
  [CLASS]: "scene",
  [ENUM]: "choose",
  [INTERFACE]: "branch",
};

const PREFIX: Record<OutlineKind, string> = {
  setup: "",
  scene: "Scene",
  choose: "Choose",
  branch: "Branch",
};

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

export const problemSummary = ({ errors, warnings }: ProblemCounts) =>
  [
    errors ? plural(errors, "error") : "",
    warnings ? plural(warnings, "warning") : "",
  ]
    .filter(Boolean)
    .join(", ");

const isWithin = (position: Position, range: Range) =>
  (position.line > range.start.line ||
    (position.line === range.start.line &&
      position.character >= range.start.character)) &&
  (position.line < range.end.line ||
    (position.line === range.end.line &&
      position.character <= range.end.character));

const describe = (
  kind: OutlineKind,
  label: string,
  problems: ProblemCounts,
) => {
  const name = kind === "setup" ? "Script setup" : `${PREFIX[kind]}: ${label}`;
  const summary = problemSummary(problems);
  if (!summary) {
    return name;
  }
  return kind === "scene"
    ? `${name}, ${summary} in this scene`
    : `${name}, ${summary}`;
};

const rowChildren = (symbol: DocumentSymbol) =>
  (symbol.children ?? []).filter((child) => KIND_OF[child.kind]);

export function outlineRows({
  symbols,
  diagnostics,
  caret,
  collapsed = [],
  firstContentLine,
}: OutlineInput): OutlineModel {
  const counts = countSymbolProblems(symbols, diagnostics);
  const rows: OutlineRow[] = [];
  let currentIndex = -1;
  const firstScene = symbols.find((s) => KIND_OF[s.kind] === "scene");
  if (
    firstScene &&
    firstContentLine != null &&
    firstContentLine < firstScene.range.start.line
  ) {
    const problems = countProblems(
      diagnostics.filter(
        (d) => d.range.start.line < firstScene.range.start.line,
      ),
    );
    const start = { line: 0, character: 0 };
    rows.push({
      key: "setup",
      kind: "setup",
      label: "Script setup",
      accessibleName: describe("setup", "Script setup", problems),
      depth: 0,
      selection: { start, end: start },
      problems,
      current: "none",
    });
  }
  const sceneOccurrences = new Map<string, number>();
  const visit = (
    symbol: DocumentSymbol,
    depth: number,
    path: string,
    hidden: boolean,
  ): boolean => {
    const kind = KIND_OF[symbol.kind]!;
    const children = rowChildren(symbol);
    let scene: string | undefined;
    if (kind === "scene") {
      const occurrence = sceneOccurrences.get(symbol.name) ?? 0;
      sceneOccurrences.set(symbol.name, occurrence + 1);
      scene = `${symbol.name}#${occurrence}`;
    }
    const key = `${path}/${kind}:${symbol.name}@${symbol.range.start.line}`;
    const isCollapsed = Boolean(scene && collapsed.includes(scene));
    const symbolCounts = counts.get(symbol);
    const problems =
      (kind === "scene" ? symbolCounts?.total : symbolCounts?.direct) ??
      countProblems([]);
    const index = rows.length;
    if (!hidden) {
      rows.push({
        key,
        kind,
        label: symbol.name,
        accessibleName: describe(kind, symbol.name, problems),
        depth: Math.min(depth, 3) as OutlineDepth,
        selection: symbol.selectionRange,
        problems,
        current: "none",
        scene,
        expanded: scene && children.length ? !isCollapsed : undefined,
      });
    }
    const containsCaret = caret != null && isWithin(caret, symbol.range);
    let childHolds = false;
    for (const child of children) {
      childHolds =
        visit(child, depth + 1, key, hidden || isCollapsed) || childHolds;
    }
    if (!hidden && containsCaret) {
      const row = rows[index]!;
      if (childHolds && !isCollapsed) {
        row.current = "ancestor";
      } else {
        row.current = "self";
        currentIndex = index;
      }
    }
    return containsCaret;
  };
  for (const symbol of symbols) {
    if (KIND_OF[symbol.kind]) {
      visit(symbol, 0, "", false);
    }
  }
  return {
    rows,
    currentIndex,
    problems: countProblems(diagnostics),
  };
}
