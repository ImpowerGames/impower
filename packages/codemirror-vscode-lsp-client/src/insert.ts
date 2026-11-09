import { isolateHistory } from "@codemirror/commands";
import type { Command, EditorView } from "@codemirror/view";
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

interface SourceLine {
  from: number;
  to: number;
  text: string;
  indent: string;
  content: string;
}

const SCENE_SYMBOL_KIND: typeof lsp.SymbolKind.Class = 5;

const STEP = "  ";

const COMMENT = String.raw`(?:\s*(?:--|\/\/).*)?`;
const BLOCK_HEADER = new RegExp(
  String.raw`^(?:(?:scene|branch)\s+[\p{L}_][\p{L}\p{N}_]*.*|choose${COMMENT}\s*)$`,
  "u",
);
const END_LINE = new RegExp(String.raw`^end${COMMENT}\s*$`);
const CUE = new RegExp(
  String.raw`^([\p{L}\p{N}][\p{L}\p{N} _'’.-]*?)\s*(?:\([^)]*\))?\s*(?:\[[^\]]*\])?:${COMMENT}\s*$`,
  "u",
);

const newlineOf = (source: string) => (source.includes("\r\n") ? "\r\n" : "\n");

const widthOf = (indent: string) => indent.replace(/\t/g, STEP).length;

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
  let index = 0;
  while (index + 1 < lines.length && lines[index + 1]!.from <= offset) index++;
  return index;
}

const sceneAt = (scenes: readonly SceneSpan[], index: number) =>
  scenes.find((scene) => index >= scene.startLine && index <= scene.endLine) ??
  null;

export function insertContext(
  source: string,
  offset: number,
  scenes: readonly SceneSpan[],
): InsertContext {
  return { inScene: !!sceneAt(scenes, lineIndexAt(linesOf(source), offset)) };
}

const cueName = (line: SourceLine) => line.content.match(CUE)?.[1] ?? null;

function cueOwning(lines: SourceLine[], index: number): number | null {
  const line = lines[index]!;
  if (!line.content) return null;
  if (cueName(line)) return index;
  const width = widthOf(line.indent);
  for (let previous = index - 1; previous >= 0; previous--) {
    const candidate = lines[previous]!;
    if (!candidate.content) continue;
    if (widthOf(candidate.indent) >= width) continue;
    return cueName(candidate) ? previous : null;
  }
  return null;
}

function dialogueEnd(lines: SourceLine[], cue: number): number {
  const width = widthOf(lines[cue]!.indent);
  let last = cue;
  for (let next = cue + 1; next < lines.length; next++) {
    const line = lines[next]!;
    if (!line.content) continue;
    if (widthOf(line.indent) <= width) break;
    last = next;
  }
  return last;
}

function cueAround(lines: SourceLine[], index: number): number | null {
  if (lines[index]!.content) return cueOwning(lines, index);
  let previous = index - 1;
  while (previous >= 0 && !lines[previous]!.content) previous--;
  const cue = previous >= 0 ? cueOwning(lines, previous) : null;
  return cue != null && dialogueEnd(lines, cue) > index ? cue : null;
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
        lines: ["((play music music_name looping))"],
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
  const current = sceneAt(scenes, index);
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
  scenes: readonly SceneSpan[],
): InsertPlan | null {
  if (!sceneAt(scenes, index)) return null;
  const newline = newlineOf(source);
  const line = lines[index]!;
  let mode: "after" | "replace" | "before" = "after";
  let at = line.to;
  let indent = line.indent;
  let speaker: string | null = null;
  const cue = cueAround(lines, index);
  if (cue != null) {
    speaker = cueName(lines[cue]!);
    indent = lines[cue]!.indent;
    at = lines[dialogueEnd(lines, cue)]!.to;
  } else if (!line.content) {
    mode = "replace";
    if (!indent) {
      let previous = index - 1;
      while (previous >= 0 && !lines[previous]!.content) previous--;
      const above = previous >= 0 ? lines[previous]! : null;
      const aboveCue = previous >= 0 ? cueOwning(lines, previous) : null;
      indent =
        aboveCue != null
          ? lines[aboveCue]!.indent
          : above && BLOCK_HEADER.test(above.content)
            ? above.indent + STEP
            : (above?.indent ?? "");
    }
  } else if (END_LINE.test(line.content)) {
    mode = "before";
    at = line.from;
    indent = line.indent + STEP;
  } else if (BLOCK_HEADER.test(line.content)) {
    indent = line.indent + STEP;
  }
  if (!indent) indent = STEP;
  const template = templateOf(construct, source, speaker);
  const block = template.lines.map((text) => indent + text).join(newline);
  const offset = block.indexOf(template.placeholder);
  if (mode === "replace") {
    const anchor = line.from + offset;
    return {
      from: line.from,
      to: line.to,
      insert: block,
      anchor,
      head: anchor + template.placeholder.length,
    };
  }
  if (mode === "before") {
    const anchor = at + offset;
    return {
      from: at,
      to: at,
      insert: block + newline,
      anchor,
      head: anchor + template.placeholder.length,
    };
  }
  const anchor = at + newline.length + offset;
  return {
    from: at,
    to: at,
    insert: newline + block,
    anchor,
    head: anchor + template.placeholder.length,
  };
}

export function planInsertion(
  source: string,
  offset: number,
  construct: InsertConstruct,
  scenes: readonly SceneSpan[],
): InsertPlan | null {
  const lines = linesOf(source);
  const index = lineIndexAt(
    lines,
    Math.max(0, Math.min(source.length, offset)),
  );
  if (construct === "scene") return planScene(source, lines, index, scenes);
  if (construct === "character") return planCharacter(source, lines, scenes);
  return planStoryBlock(source, lines, index, construct, scenes);
}

export const insertConstruct =
  (construct: InsertConstruct, scenes: readonly SceneSpan[]): Command =>
  (view) => {
    if (view.state.readOnly) return false;
    const plan = planInsertion(
      view.state.doc.toString(),
      view.state.selection.main.head,
      construct,
      scenes,
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

export async function readSceneSpans(
  view: EditorView,
): Promise<SceneSpan[] | null> {
  const plugin = LSPPlugin.get(view);
  if (!plugin) return null;
  plugin.client.sync();
  const doc = view.state.doc;
  const symbols = await plugin.client
    .request<
      lsp.DocumentSymbolParams,
      lsp.DocumentSymbol[] | null,
      typeof lsp.DocumentSymbolRequest.method
    >("textDocument/documentSymbol", { textDocument: { uri: plugin.uri } })
    .catch(() => undefined);
  return symbols !== undefined && view.state.doc === doc
    ? sceneSpansOf(symbols)
    : null;
}

export async function insertConstructFromServer(
  view: EditorView,
  construct: InsertConstruct,
): Promise<boolean> {
  const scenes = await readSceneSpans(view);
  return !!scenes && insertConstruct(construct, scenes)(view);
}
