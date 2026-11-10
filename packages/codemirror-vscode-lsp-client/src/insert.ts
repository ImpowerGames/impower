import { isolateHistory } from "@codemirror/commands";
import { ensureSyntaxTree } from "@codemirror/language";
import type { Command, EditorView } from "@codemirror/view";
import type { SyntaxNode, Tree } from "@lezer/common";
import type * as lsp from "vscode-languageserver-protocol";
import { LSPPlugin } from "./plugin";

export const INSERT_CONSTRUCTS = [
  "character",
  "scene",
  "branch",
  "choose",
  "dialogue",
  "backdrop",
  "portrait",
  "sound",
  "music",
] as const;

export type InsertConstruct = (typeof INSERT_CONSTRUCTS)[number];

export const isInsertConstruct = (value: string): value is InsertConstruct =>
  (INSERT_CONSTRUCTS as readonly string[]).includes(value);

export const TOP_LEVEL_CONSTRUCTS: readonly InsertConstruct[] = [
  "character",
  "scene",
];

export interface InsertPlan {
  from: number;
  to: number;
  insert: string;
  anchor: number;
  head: number;
}

export interface InsertContext {
  inScene: boolean;
}

export interface SceneSpan {
  startLine: number;
  endLine: number;
}

export interface ScriptStructure {
  scenes: readonly SceneSpan[];
  branches: readonly SceneSpan[];
  tree: Tree;
  endsDialogue: EndsDialogue;
}

export type EndsDialogue = (line: string, cueIndent: string) => boolean;

export type BodyKind = "scene" | "branch" | "option" | "then";

interface SourceLine {
  from: number;
  to: number;
  text: string;
  indent: string;
  content: string;
}

interface Statement {
  startLine: number;
  endLine: number;
}

interface Body {
  kind: BodyKind;
  headerLine: number;
  closingLine: number | null;
  statements: Statement[];
}

const SCENE_SYMBOL_KIND: typeof lsp.SymbolKind.Class = 5;

const BRANCH_SYMBOL_KIND: typeof lsp.SymbolKind.Interface = 11;

const STEP = "  ";

const PARSE_BUDGET_MS = 50;

const CHOOSE_CONTENT = "LuauSparkdownChooseBlock_content";
const CHOICE = "Choice";
const THEN_CLAUSE = "LuauSparkdownChooseThenClause";
const THEN_CONTENT = "LuauSparkdownChooseThenClause_content";
const DIALOGUE_NODES = ["BlockDialogue", "InlineDialogue"];
const SPACING_NODES = ["Newline", "Whitespace"];

const ACCEPTED_BY: Record<InsertConstruct, readonly BodyKind[]> = {
  character: [],
  scene: [],
  branch: ["scene"],
  choose: ["scene", "branch", "option", "then"],
  dialogue: ["scene", "branch", "option", "then"],
  backdrop: ["scene", "branch", "option", "then"],
  portrait: ["scene", "branch", "option", "then"],
  sound: ["scene", "branch", "option", "then"],
  music: ["scene", "branch", "option", "then"],
};

const newlineOf = (source: string) => (source.includes("\r\n") ? "\r\n" : "\n");

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

export function uniqueName(source: string, base: string): string {
  const taken = (name: string) =>
    new RegExp(
      String.raw`(?<![\p{L}\p{N}_])${escapeRegExp(name)}(?![\p{L}\p{N}_])`,
      "u",
    ).test(source);
  if (!taken(base)) return base;
  let number = 2;
  while (taken(`${base}_${number}`)) number++;
  return `${base}_${number}`;
}

export function sceneSpansOf(
  symbols: readonly lsp.DocumentSymbol[] | null | undefined,
): SceneSpan[] {
  return (symbols ?? [])
    .filter((symbol) => symbol.kind === SCENE_SYMBOL_KIND)
    .map((symbol) => ({
      startLine: symbol.range.start.line,
      endLine: symbol.range.end.line,
    }))
    .sort((a, b) => a.startLine - b.startLine);
}

export function branchSpansOf(
  symbols: readonly lsp.DocumentSymbol[] | null | undefined,
): SceneSpan[] {
  const spans: SceneSpan[] = [];
  const visit = (list: readonly lsp.DocumentSymbol[]) => {
    for (const symbol of list) {
      if (symbol.kind === BRANCH_SYMBOL_KIND) {
        spans.push({
          startLine: symbol.range.start.line,
          endLine: symbol.range.end.line,
        });
      }
      visit(symbol.children ?? []);
    }
  };
  visit(symbols ?? []);
  return spans.sort((a, b) => a.startLine - b.startLine);
}

function linesOf(source: string): SourceLine[] {
  const lines: SourceLine[] = [];
  let from = 0;
  while (from <= source.length) {
    const found = source.indexOf("\n", from);
    const end = found < 0 ? source.length : found;
    const to = source[end - 1] === "\r" ? end - 1 : end;
    const text = source.slice(from, to);
    const indent = text.match(/^[\t ]*/)![0];
    lines.push({ from, to, text, indent, content: text.slice(indent.length) });
    if (found < 0) break;
    from = found + 1;
  }
  return lines;
}

function lineIndexAt(lines: SourceLine[], offset: number): number {
  let low = 0;
  let high = lines.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (lines[middle]!.from <= offset) low = middle;
    else high = middle - 1;
  }
  return low;
}

const spanAt = (spans: readonly SceneSpan[], index: number) =>
  spans.find((span) => index >= span.startLine && index <= span.endLine) ??
  null;

const innermostSpanAt = (spans: readonly SceneSpan[], index: number) =>
  spans
    .filter((span) => index >= span.startLine && index <= span.endLine)
    .at(-1) ?? null;

export function insertContext(
  source: string,
  offset: number,
  scenes: readonly SceneSpan[],
): InsertContext {
  return { inScene: !!spanAt(scenes, lineIndexAt(linesOf(source), offset)) };
}

function statementOf(lines: SourceLine[], node: SyntaxNode): Statement | null {
  if (SPACING_NODES.includes(node.name) || node.from >= node.to) return null;
  const startLine = lineIndexAt(lines, node.from);
  let endLine = lineIndexAt(lines, Math.max(node.from, node.to - 1));
  while (endLine > startLine && !lines[endLine]!.content) endLine--;
  if (!lines[startLine]!.content && startLine === endLine) return null;
  return { startLine, endLine };
}

function rootStatements(
  lines: SourceLine[],
  tree: Tree,
  firstLine: number,
  lastLine: number,
  branches: readonly SceneSpan[],
): Statement[] {
  const statements: Statement[] = [];
  const start = lines[firstLine]?.from ?? 0;
  for (
    let node = tree.topNode.childAfter(start);
    node && lineIndexAt(lines, node.from) <= lastLine;
    node = node.nextSibling
  ) {
    const statement = statementOf(lines, node);
    if (!statement) continue;
    const branch = branches.find(
      (span) =>
        span.startLine >= firstLine &&
        span.endLine <= lastLine &&
        statement.startLine >= span.startLine &&
        statement.startLine <= span.endLine,
    );
    const next = branch
      ? { startLine: branch.startLine, endLine: branch.endLine }
      : statement;
    const last = statements.at(-1);
    if (last && last.startLine === next.startLine) continue;
    statements.push(next);
  }
  return statements;
}

function childStatements(
  lines: SourceLine[],
  from: SyntaxNode | null,
  stop: (node: SyntaxNode) => boolean,
): Statement[] {
  const statements: Statement[] = [];
  for (let node = from; node && !stop(node); node = node.nextSibling) {
    const statement = statementOf(lines, node);
    if (statement) statements.push(statement);
  }
  return statements;
}

function treeBodiesAt(lines: SourceLine[], tree: Tree, index: number): Body[] {
  const line = lines[index]!;
  const bodies: Body[] = [];
  for (
    let node: SyntaxNode | null = tree.resolveInner(
      line.from + line.indent.length,
      1,
    );
    node;
    node = node.parent
  ) {
    if (node.name === THEN_CLAUSE) {
      const content = node.getChild(THEN_CONTENT);
      bodies.push({
        kind: "then",
        headerLine: lineIndexAt(lines, node.from),
        closingLine: null,
        statements: childStatements(
          lines,
          content?.firstChild ?? null,
          () => false,
        ),
      });
    } else if (node.name === CHOOSE_CONTENT) {
      let choice: SyntaxNode | null = null;
      for (let child = node.firstChild; child; child = child.nextSibling) {
        if (lineIndexAt(lines, child.from) > index) break;
        if (child.name === CHOICE) choice = child;
        if (child.name === THEN_CLAUSE) choice = null;
      }
      if (choice) {
        bodies.push({
          kind: "option",
          headerLine: lineIndexAt(lines, choice.from),
          closingLine: null,
          statements: childStatements(
            lines,
            choice.nextSibling,
            (sibling) =>
              sibling.name === CHOICE || sibling.name === THEN_CLAUSE,
          ),
        });
      }
    }
  }
  return bodies;
}

function speakerAt(
  lines: SourceLine[],
  tree: Tree,
  index: number,
  source: string,
): string | null {
  const line = lines[index]!;
  for (
    let node: SyntaxNode | null = tree.resolveInner(
      line.from + line.indent.length,
      1,
    );
    node;
    node = node.parent
  ) {
    if (DIALOGUE_NODES.includes(node.name)) {
      const name = node.cursor();
      while (name.next() && name.from < node.to) {
        if (name.name === "DialogueCharacterName") {
          return source.slice(name.from, name.to).trim() || null;
        }
      }
      return null;
    }
  }
  return null;
}

function bodiesAt(
  lines: SourceLine[],
  index: number,
  structure: ScriptStructure,
): Body[] {
  const scene = spanAt(structure.scenes, index);
  if (!scene) return [];
  const bodies = treeBodiesAt(lines, structure.tree, index);
  const branch = innermostSpanAt(
    structure.branches.filter(
      (span) =>
        span.startLine > scene.startLine && span.endLine <= scene.endLine,
    ),
    index,
  );
  if (branch) {
    bodies.push({
      kind: "branch",
      headerLine: branch.startLine,
      closingLine: branch.endLine,
      statements: rootStatements(
        lines,
        structure.tree,
        branch.startLine + 1,
        branch.endLine - 1,
        [],
      ),
    });
  }
  bodies.push({
    kind: "scene",
    headerLine: scene.startLine,
    closingLine: scene.endLine,
    statements: rootStatements(
      lines,
      structure.tree,
      scene.startLine + 1,
      scene.endLine - 1,
      structure.branches,
    ),
  });
  return bodies;
}

function templateOf(
  construct: InsertConstruct,
  source: string,
  speaker: string | null,
): { lines: string[]; placeholder: string } {
  switch (construct) {
    case "branch": {
      const id = uniqueName(source, "new_branch");
      return { lines: [`branch ${id}`, STEP, "end"], placeholder: id };
    }
    case "choose":
      return {
        lines: [
          "choose",
          `${STEP}What happens next?`,
          `${STEP}+ [First option]`,
          `${STEP}${STEP}The first path begins here.`,
          `${STEP}+ [Second option]`,
          `${STEP}${STEP}The second path begins here.`,
          "end",
        ],
        placeholder: "What happens next?",
      };
    case "dialogue":
      return {
        lines: [`${speaker ?? "CHARACTER"}:`, `${STEP}What do they say?`],
        placeholder: speaker ? "What do they say?" : "CHARACTER",
      };
    case "backdrop":
      return {
        lines: ["[[show backdrop backdrop_name]]"],
        placeholder: "backdrop_name",
      };
    case "portrait":
      return {
        lines: ["[[show portrait portrait_name]]"],
        placeholder: "portrait_name",
      };
    case "sound":
      return { lines: ["((sound_name))"], placeholder: "sound_name" };
    case "music":
      return {
        lines: ["((play music music_name loop))"],
        placeholder: "music_name",
      };
    default:
      throw new Error(`${construct} is not a story block`);
  }
}

function planScene(
  source: string,
  lines: SourceLine[],
  index: number,
  scenes: readonly SceneSpan[],
): InsertPlan {
  const newline = newlineOf(source);
  const id = uniqueName(source, "new_scene");
  const block = [`scene ${id}`, STEP, "end"].join(newline);
  const current = spanAt(scenes, index);
  if (current) {
    const at = lines[Math.min(current.endLine, lines.length - 1)]!.to;
    const insert = newline + newline + block;
    const anchor = at + newline.length * 2 + "scene ".length;
    return { from: at, to: at, insert, anchor, head: anchor + id.length };
  }
  const gap =
    !source || source.endsWith(newline + newline)
      ? ""
      : source.endsWith(newline)
        ? newline
        : newline + newline;
  const at = source.length;
  const anchor = at + gap.length + "scene ".length;
  return {
    from: at,
    to: at,
    insert: gap + block + newline,
    anchor,
    head: anchor + id.length,
  };
}

function planCharacter(
  source: string,
  lines: SourceLine[],
  scenes: readonly SceneSpan[],
): InsertPlan {
  const newline = newlineOf(source);
  const id = uniqueName(source, "new_character");
  const first = scenes[0];
  const at = first ? lines[first.startLine]!.from : source.length;
  const before = source.slice(0, at);
  const gap =
    !before || before.endsWith(newline + newline)
      ? ""
      : before.endsWith(newline)
        ? newline
        : newline + newline;
  const block =
    [
      `define ${id} as character with`,
      `${STEP}name = "New character"`,
      "end",
    ].join(newline) +
    newline +
    (first ? newline : "");
  const anchor = at + gap.length + "define ".length;
  return {
    from: at,
    to: at,
    insert: gap + block,
    anchor,
    head: anchor + id.length,
  };
}

function settleCue(
  lines: SourceLine[],
  placement: Placement,
  endsDialogue: EndsDialogue,
): Placement {
  const after =
    placement.mode === "before" ? placement.line - 1 : placement.line;
  let { mode, line, indent } = placement;
  for (let next = after + 1; next < lines.length; next++) {
    const candidate = lines[next]!;
    if (!candidate.content) continue;
    if (candidate.text.startsWith("//")) {
      mode = "after";
      line = next;
      continue;
    }
    if (!endsDialogue(candidate.text, indent)) indent = candidate.indent;
    break;
  }
  return { mode, line, indent };
}

function planStoryBlock(
  source: string,
  lines: SourceLine[],
  index: number,
  construct: InsertConstruct,
  structure: ScriptStructure,
): InsertPlan | null {
  const body = bodiesAt(lines, index, structure).find((candidate) =>
    ACCEPTED_BY[construct].includes(candidate.kind),
  );
  if (!body) return null;
  const indent = lines[body.headerLine]!.indent + STEP;
  let placement: Placement;
  if (index === body.headerLine) {
    placement = { mode: "after", line: index, indent };
  } else if (index === body.closingLine) {
    placement = { mode: "before", line: index, indent };
  } else {
    const statement = body.statements.find(
      (candidate) => index >= candidate.startLine && index <= candidate.endLine,
    );
    placement = statement
      ? { mode: "after", line: statement.endLine, indent }
      : !lines[index]!.content
        ? { mode: "replace", line: index, indent }
        : { mode: "after", line: index, indent };
  }
  if (construct === "dialogue") {
    placement = settleCue(lines, placement, structure.endsDialogue);
  }
  const lastLine = lineIndexAt(lines, structure.tree.length);
  if (placement.line > lastLine && structure.tree.length < source.length) {
    return null;
  }
  const speaker =
    construct === "dialogue"
      ? speakerAt(lines, structure.tree, index, source)
      : null;
  return placed(
    source,
    lines,
    placement,
    templateOf(construct, source, speaker),
  );
}

interface Placement {
  mode: "after" | "replace" | "before";
  line: number;
  indent: string;
}

function placed(
  source: string,
  lines: SourceLine[],
  { mode, line: index, indent }: Placement,
  template: { lines: string[]; placeholder: string },
): InsertPlan {
  const newline = newlineOf(source);
  const line = lines[index]!;
  const block = template.lines.map((text) => indent + text).join(newline);
  const offset = block.indexOf(template.placeholder);
  const length = template.placeholder.length;
  if (mode === "replace") {
    const anchor = line.from + offset;
    return {
      from: line.from,
      to: line.to,
      insert: block,
      anchor,
      head: anchor + length,
    };
  }
  if (mode === "before") {
    const anchor = line.from + offset;
    return {
      from: line.from,
      to: line.from,
      insert: block + newline,
      anchor,
      head: anchor + length,
    };
  }
  const anchor = line.to + newline.length + offset;
  return {
    from: line.to,
    to: line.to,
    insert: newline + block,
    anchor,
    head: anchor + length,
  };
}

const CRLF = "\r\n";
const LF = "\n";

const lfOffset = (source: string, offset: number) =>
  offset - source.slice(0, offset).split(CRLF).length + 1;

const crlfOffset = (lf: string, offset: number) =>
  offset + lf.slice(0, offset).split(LF).length - 1;

export function planInsertion(
  source: string,
  offset: number,
  construct: InsertConstruct,
  structure: ScriptStructure,
): InsertPlan | null {
  if (source.includes(CRLF)) {
    const lf = source.split(CRLF).join(LF);
    const plan = planInsertion(
      lf,
      lfOffset(source, offset),
      construct,
      structure,
    );
    if (!plan) return null;
    const next = lf.slice(0, plan.from) + plan.insert + lf.slice(plan.to);
    return {
      from: crlfOffset(lf, plan.from),
      to: crlfOffset(lf, plan.to),
      insert: plan.insert.split(LF).join(CRLF),
      anchor: crlfOffset(next, plan.anchor),
      head: crlfOffset(next, plan.head),
    };
  }
  const lines = linesOf(source);
  const index = lineIndexAt(
    lines,
    Math.max(0, Math.min(source.length, offset)),
  );
  if (construct === "scene") {
    return planScene(source, lines, index, structure.scenes);
  }
  if (construct === "character") {
    return planCharacter(source, lines, structure.scenes);
  }
  return planStoryBlock(source, lines, index, construct, structure);
}

export const insertConstruct =
  (construct: InsertConstruct, structure: ScriptStructure): Command =>
  (view) => {
    if (view.state.readOnly) return false;
    const plan = planInsertion(
      view.state.doc.toString(),
      view.state.selection.main.head,
      construct,
      structure,
    );
    if (!plan) return false;
    view.dispatch({
      changes: { from: plan.from, to: plan.to, insert: plan.insert },
      selection: { anchor: plan.anchor, head: plan.head },
      scrollIntoView: true,
      userEvent: "input",
      annotations: isolateHistory.of("full"),
    });
    return true;
  };

export async function insertConstructFromServer(
  view: EditorView,
  construct: InsertConstruct,
  endsDialogue: EndsDialogue,
): Promise<boolean> {
  const plugin = LSPPlugin.get(view);
  if (!plugin) return false;
  plugin.client.sync();
  const doc = view.state.doc;
  const symbols = await plugin.client
    .request<
      lsp.DocumentSymbolParams,
      lsp.DocumentSymbol[] | null,
      typeof lsp.DocumentSymbolRequest.method
    >("textDocument/documentSymbol", { textDocument: { uri: plugin.uri } })
    .catch(() => undefined);
  if (
    symbols === undefined ||
    LSPPlugin.get(view) !== plugin ||
    plugin.client.workspace.getFile(plugin.uri)?.getView() !== view ||
    view.state.doc !== doc
  ) {
    return false;
  }
  const caretLine = doc.lineAt(view.state.selection.main.head);
  const tree = ensureSyntaxTree(view.state, caretLine.to, PARSE_BUDGET_MS);
  if (!tree || tree.length < caretLine.to) return false;
  return insertConstruct(construct, {
    scenes: sceneSpansOf(symbols),
    branches: branchSpansOf(symbols),
    tree,
    endsDialogue,
  })(view);
}
