import { isolateHistory } from "@codemirror/commands";
import { ensureSyntaxTree, language } from "@codemirror/language";
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

export interface DialogueCue {
  startLine: number;
  endLine: number;
  speaker: string;
}

export interface StoryBlock {
  startLine: number;
  endLine: number;
  speaker: string | null;
  cues: readonly DialogueCue[];
}

export interface ScriptStructure {
  scenes: readonly SceneSpan[];
  branches: readonly SceneSpan[];
  blocks: readonly StoryBlock[];
  parse?: (text: string) => Tree;
}

interface SourceLine {
  from: number;
  to: number;
  text: string;
  indent: string;
  content: string;
}

const SCENE_SYMBOL_KIND: typeof lsp.SymbolKind.Class = 5;

const BRANCH_SYMBOL_KIND: typeof lsp.SymbolKind.Interface = 11;

const STEP = "  ";

const PARSE_BUDGET_MS = 500;

const COMMENT = String.raw`(?:\s*(?:--|\/\/).*)?`;
const BLOCK_HEADER = new RegExp(
  String.raw`^(?:scene|branch)\s+[\p{L}_][\p{L}\p{N}_]*`,
  "u",
);
const END_LINE = new RegExp(String.raw`^end${COMMENT}\s*$`);

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

const DIALOGUE_NODES = ["BlockDialogue", "InlineDialogue"];

function speakerOf(node: SyntaxNode, source: string): string | null {
  if (!DIALOGUE_NODES.includes(node.name)) return null;
  const cursor = node.cursor();
  while (cursor.next() && cursor.from < node.to) {
    if (cursor.name === "DialogueCharacterName") {
      return source.slice(cursor.from, cursor.to).trim() || null;
    }
  }
  return null;
}

export function storyBlocksOf(tree: Tree, source: string): StoryBlock[] {
  const lines = linesOf(source);
  const blocks: StoryBlock[] = [];
  const linesOfNode = (node: SyntaxNode) => {
    const startLine = lineIndexAt(lines, node.from);
    let endLine = lineIndexAt(lines, Math.max(node.from, node.to - 1));
    while (endLine > startLine && !lines[endLine]!.content) endLine--;
    return { startLine, endLine };
  };
  for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
    const { startLine, endLine } = linesOfNode(node);
    const speaker = speakerOf(node, source);
    if (endLine <= startLine && !speaker) continue;
    const cues: DialogueCue[] = [];
    const cursor = node.cursor();
    while (cursor.next() && cursor.from < node.to) {
      const cue = speakerOf(cursor.node, source);
      if (cue) cues.push({ ...linesOfNode(cursor.node), speaker: cue });
    }
    blocks.push({ startLine, endLine, speaker, cues });
  }
  return blocks;
}

interface TopNode {
  from: number;
  to: number;
  name: string;
  text: string;
}

function topNodesOf(tree: Tree, source: string): TopNode[] {
  const nodes: TopNode[] = [];
  for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
    const raw = source.slice(node.from, node.to);
    const text = raw.trim();
    if (text) {
      const from = node.from + (raw.length - raw.trimStart().length);
      nodes.push({ from, to: from + text.length, name: node.name, text });
    }
  }
  return nodes;
}

const EXPECTED_NODE: Partial<Record<InsertConstruct, string>> = {
  branch: "Branch",
  choose: "LuauSparkdownChooseBlock",
  dialogue: "BlockDialogue",
};

function keepsMeaning(
  source: string,
  plan: InsertPlan,
  construct: InsertConstruct,
  before: readonly TopNode[],
  parse: (text: string) => Tree,
): boolean {
  const text = source.slice(0, plan.from) + plan.insert + source.slice(plan.to);
  const from = plan.from;
  const to = plan.from + plan.insert.length;
  const outside: string[] = [];
  const inside: TopNode[] = [];
  for (const node of topNodesOf(parse(text), text)) {
    if (node.to <= from || node.from >= to) outside.push(node.text);
    else if (node.from >= from && node.to <= to) inside.push(node);
    else return false;
  }
  const kept = before
    .filter((node) => node.to <= plan.from || node.from >= plan.to)
    .map((node) => node.text);
  if (
    kept.length !== outside.length ||
    kept.some((node, i) => node !== outside[i])
  ) {
    return false;
  }
  const expected = EXPECTED_NODE[construct];
  return !expected || inside.some((node) => node.name === expected);
}

const spanAt = <T extends { startLine: number; endLine: number }>(
  spans: readonly T[],
  index: number,
) =>
  spans.find((span) => index >= span.startLine && index <= span.endLine) ??
  null;

export function insertContext(
  source: string,
  offset: number,
  scenes: readonly SceneSpan[],
): InsertContext {
  return { inScene: !!spanAt(scenes, lineIndexAt(linesOf(source), offset)) };
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

function planStoryBlock(
  source: string,
  lines: SourceLine[],
  index: number,
  construct: InsertConstruct,
  structure: ScriptStructure,
): InsertPlan | null {
  const scene = spanAt(structure.scenes, index);
  if (!scene) return null;
  const line = lines[index]!;
  let mode: Placement["mode"] = "after";
  let atLine = index;
  let indent = line.indent;
  let speaker: string | null = null;
  const enclosing = spanAt(structure.blocks, index);
  const branch =
    construct === "branch" ? spanAt(structure.branches, index) : null;
  if (branch) {
    indent = lines[branch.startLine]!.indent;
    atLine = Math.min(branch.endLine, lines.length - 1);
  } else if (enclosing) {
    const cue = enclosing.cues
      .filter((cue) => index >= cue.startLine && index <= cue.endLine)
      .at(-1);
    speaker = cue?.speaker ?? enclosing.speaker;
    indent = lines[enclosing.startLine]!.indent;
    atLine = enclosing.endLine;
  } else if (!line.content) {
    mode = "replace";
    if (!indent) {
      let previous = index - 1;
      while (previous >= 0 && !lines[previous]!.content) previous--;
      const above = previous >= 0 ? lines[previous]! : null;
      const aboveBlock =
        previous >= 0 ? spanAt(structure.blocks, previous) : null;
      indent = aboveBlock
        ? lines[aboveBlock.startLine]!.indent
        : above && BLOCK_HEADER.test(above.content)
          ? above.indent + STEP
          : (above?.indent ?? "");
    }
  } else if (END_LINE.test(line.content)) {
    mode = "before";
    indent = line.indent + STEP;
  } else if (BLOCK_HEADER.test(line.content)) {
    indent = line.indent + STEP;
  }
  if (!indent) indent = STEP;
  const sceneIndent = lines[scene.startLine]!.indent + STEP;
  const sceneEnd = Math.min(scene.endLine, lines.length - 1);
  const placements: Placement[] = [
    { mode, line: mode === "after" ? atLine : index, indent },
    END_LINE.test(lines[sceneEnd]!.content)
      ? { mode: "before", line: sceneEnd, indent: sceneIndent }
      : { mode: "after", line: sceneEnd, indent: sceneIndent },
  ];
  const template = templateOf(construct, source, speaker);
  const before = structure.parse
    ? topNodesOf(structure.parse(source), source)
    : null;
  for (const placement of placements) {
    const plan = placed(source, lines, placement, template);
    if (
      !before ||
      keepsMeaning(source, plan, construct, before, structure.parse!)
    ) {
      return plan;
    }
  }
  return null;
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
  const tree = ensureSyntaxTree(view.state, doc.length, PARSE_BUDGET_MS);
  if (!tree) return false;
  const parser = view.state.facet(language)?.parser;
  const structure: ScriptStructure = {
    scenes: sceneSpansOf(symbols),
    branches: branchSpansOf(symbols),
    blocks: storyBlocksOf(tree, doc.toString()),
    parse: parser ? (text) => parser.parse(text) : undefined,
  };
  return insertConstruct(construct, structure)(view);
}
