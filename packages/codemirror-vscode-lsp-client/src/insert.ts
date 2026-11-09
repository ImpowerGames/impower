import { isolateHistory } from "@codemirror/commands";
import type { Command } from "@codemirror/view";

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

interface SourceLine {
  from: number;
  to: number;
  text: string;
  indent: string;
  content: string;
}

interface SceneSpan {
  start: number;
  end: number;
}

const STEP = "  ";

const SCENE_HEADER = /^scene\s+[\p{L}_][\p{L}\p{N}_]*/u;
const BLOCK_HEADER =
  /^(?:(?:scene|branch)\s+[\p{L}_][\p{L}\p{N}_]*.*|choose\s*(?:(?:--|\/\/).*)?)$/u;
const END_LINE = /^end\s*(?:(?:--|\/\/).*)?$/;
const CUE =
  /^([\p{L}\p{N}][\p{L}\p{N} _'’.-]*?)\s*(?:\([^)]*\))?\s*(?:\[[^\]]*\])?:\s*$/u;

const newlineOf = (source: string) => (source.includes("\r\n") ? "\r\n" : "\n");

const widthOf = (indent: string) => indent.replace(/\t/g, STEP).length;

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function uniqueName(source: string, base: string): string {
  const taken = (name: string) =>
    new RegExp(
      `(?<![\\p{L}\\p{N}_])${escapeRegExp(name)}(?![\\p{L}\\p{N}_])`,
      "u",
    ).test(source);
  if (!taken(base)) return base;
  let number = 2;
  while (taken(`${base}_${number}`)) number++;
  return `${base}_${number}`;
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

function scenesOf(lines: SourceLine[]): SceneSpan[] {
  const scenes: SceneSpan[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    if (!SCENE_HEADER.test(line.content)) continue;
    let end = lines.length - 1;
    for (let next = index + 1; next < lines.length; next++) {
      const candidate = lines[next]!;
      if (SCENE_HEADER.test(candidate.content)) {
        end = next - 1;
        while (end > index && !lines[end]!.content) end--;
        break;
      }
      if (
        END_LINE.test(candidate.content) &&
        candidate.indent === line.indent
      ) {
        end = next;
        break;
      }
    }
    scenes.push({ start: index, end });
    index = end;
  }
  return scenes;
}

const sceneAt = (scenes: SceneSpan[], index: number) =>
  scenes.find((scene) => index >= scene.start && index <= scene.end) ?? null;

export function insertContext(source: string, offset: number): InsertContext {
  const lines = linesOf(source);
  return { inScene: !!sceneAt(scenesOf(lines), lineIndexAt(lines, offset)) };
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
): InsertPlan {
  const newline = newlineOf(source);
  const id = uniqueName(source, "new_scene");
  const block = [`scene ${id}`, STEP, "end"].join(newline);
  const current = sceneAt(scenesOf(lines), index);
  if (current) {
    const at = lines[current.end]!.to;
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

function planCharacter(source: string, lines: SourceLine[]): InsertPlan {
  const newline = newlineOf(source);
  const id = uniqueName(source, "new_character");
  const first = scenesOf(lines)[0];
  const at = first ? lines[first.start]!.from : source.length;
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
): InsertPlan | null {
  if (!sceneAt(scenesOf(lines), index)) return null;
  const newline = newlineOf(source);
  const line = lines[index]!;
  let mode: "after" | "replace" | "before" = "after";
  let at = line.to;
  let indent = line.indent;
  let speaker: string | null = null;
  const cue = cueOwning(lines, index);
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
): InsertPlan | null {
  const lines = linesOf(source);
  const index = lineIndexAt(
    lines,
    Math.max(0, Math.min(source.length, offset)),
  );
  if (construct === "scene") return planScene(source, lines, index);
  if (construct === "character") return planCharacter(source, lines);
  return planStoryBlock(source, lines, index, construct);
}

export const insertConstruct =
  (construct: InsertConstruct): Command =>
  (view) => {
    if (view.state.readOnly) return false;
    const plan = planInsertion(
      view.state.doc.toString(),
      view.state.selection.main.head,
      construct,
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
