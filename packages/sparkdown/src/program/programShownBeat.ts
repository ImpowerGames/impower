import { stripStyleCodes } from "../runtime/displayStyle";
import { directiveKind, type DirectiveBracket } from "../compiler/utils/readDirective";
import { CALL_TUNNEL, ConstValue, LEAVE_CONTINUE, Op, auxOf, flagsOf, opOf } from "./ProgramInstructions";
import {
  BLOCK_FUNCTION,
  BLOCK_LOOP,
  B_BREAK,
  B_RESUME,
  HEADER_WORDS,
  addressOf,
  blockField,
  blockFlags,
  chunkId,
  codeWords,
  type ProgramChunk,
} from "./ProgramChunk";
import type { ProgramRoot, SequenceRow } from "./ProgramRoot";

export type ShownBeat =
  | { kind: "own" }
  | { kind: "beat"; address: number; character?: string }
  | { kind: "unknown" };

export interface BeatRange {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

interface At {
  sequence: SequenceRow;
  entry: number;
  offset: number;
}

interface DisplayCall {
  character?: string;
  text: string[];
  dynamic: boolean;
  pause: boolean;
  load: boolean;
}

const UNKNOWN: ShownBeat = { kind: "unknown" };
const OWN: ShownBeat = { kind: "own" };
const STEP_LIMIT = 100_000;
const DIRECTIVE = /\[\[(.*?)\]\]|\(\((.*?)\)\)/gs;

const word = (chunk: ProgramChunk, offset: number) => chunk[HEADER_WORDS + offset]!;

const isDisplay = (root: ProgramRoot, chunk: ProgramChunk, offset: number) =>
  opOf(word(chunk, offset)) === Op.CallStd && root.table.strings[word(chunk, offset + 1)] === "display";

const callStart = (root: ProgramRoot, chunk: ProgramChunk, call: number): number => {
  for (let at = call - 2; at >= 0; at -= 2) {
    if (opOf(word(chunk, at)) === Op.LineStart) return at;
    if (isDisplay(root, chunk, at)) return at + 2;
  }
  return 0;
};

const readCall = (root: ProgramRoot, chunk: ProgramChunk, call: number): DisplayCall => {
  const strings = root.table.strings;
  const read: DisplayCall = { text: [], dynamic: false, pause: false, load: false };
  let at = callStart(root, chunk, call);
  if (opOf(word(chunk, at)) === Op.LineStart) at += 2;
  let key: string | undefined;
  while (at < call) {
    const op = opOf(word(chunk, at));
    const arg = word(chunk, at + 1);
    if (key === undefined) {
      if (op === Op.MakeTable) break;
      if (op !== Op.Str) {
        read.dynamic = true;
        break;
      }
      key = strings[arg];
      at += 2;
      continue;
    }
    if (op === Op.Str) {
      const value = strings[arg] ?? "";
      if (key === "character") read.character = value;
      else if (key === "text") read.text.push(value);
      else if (key === "load") read.load = true;
      at += 2;
    } else if (op === Op.Const) {
      if (key === "pause" && auxOf(word(chunk, at)) === ConstValue.True) read.pause = true;
      at += 2;
    } else if (op === Op.BeginString) {
      at += 2;
      let depth = 1;
      let expressionStart = true;
      while (at < call && depth > 0) {
        const inner = opOf(word(chunk, at));
        const value = word(chunk, at + 1);
        if (inner === Op.EndString) {
          depth -= 1;
          expressionStart = false;
          at += 2;
        } else if (inner === Op.BeginString) {
          depth += 1;
          read.dynamic = true;
          at += 2;
        } else if (depth === 1 && inner === Op.Text) {
          if (key === "text") read.text.push(strings[value] ?? "");
          expressionStart = true;
          at += 2;
        } else if (depth === 1 && expressionStart && inner === Op.Str && opOf(word(chunk, at + 2)) === Op.Out) {
          if (key === "text") read.text.push(strings[value] ?? "");
          at += 4;
        } else {
          read.dynamic = true;
          if (key === "load") read.load = true;
          expressionStart = depth === 1 && inner === Op.Out;
          at += 2;
        }
      }
    } else {
      read.dynamic = true;
      if (key === "load") read.load = true;
      break;
    }
    key = undefined;
  }
  return read;
};

const directiveKinds = (text: string) =>
  [...text.matchAll(DIRECTIVE)].map((match) =>
    match[1] !== undefined
      ? directiveKind("image" as DirectiveBracket, match[1])
      : directiveKind("audio" as DirectiveBracket, match[2] ?? ""),
  );

const writesText = (text: string) => stripStyleCodes(text).replace(DIRECTIVE, "").trim().length > 0;

const outcomeOf = (call: DisplayCall, address: number): ShownBeat | null => {
  if (call.load) return OWN;
  const text = call.text.join("");
  const kinds = directiveKinds(text);
  const writes = writesText(text);
  const beat: ShownBeat = { kind: "beat", address, ...(call.character ? { character: call.character } : {}) };
  if (kinds.includes("load") || kinds.includes("cutscene")) {
    return writes || kinds.some((kind) => kind === "image" || kind === "audio" || kind === "layout") ? beat : OWN;
  }
  if (writes || call.pause) return beat;
  if (call.dynamic) return UNKNOWN;
  return null;
};

const same = (a: ShownBeat, b: ShownBeat) =>
  a.kind === b.kind && (a.kind !== "beat" || (b.kind === "beat" && a.address === b.address));

export const shownBeat = (root: ProgramRoot, uri: string, range: BeatRange, interpolates = false): ShownBeat => {
  const start = lastDisplayCall(root, uri, range);
  if (!start) return UNKNOWN;
  const startChunk = start.sequence.arrays.chunks[start.entry]!;
  const own = readCall(root, startChunk, start.offset);
  const ownText = own.text.join("");
  const ownKinds = directiveKinds(ownText);
  if (own.load || own.pause || ownKinds.includes("load") || ownKinds.includes("cutscene")) return OWN;
  if (interpolates && writesText(ownText)) return OWN;
  if (interpolates && own.dynamic) return UNKNOWN;
  let steps = 0;
  const memo = new Map<string, ShownBeat>();
  const active = new Set<string>();
  let looped = false;
  const walk = (from: At): ShownBeat | null => {
    const at = { ...from };
    const path: string[] = [];
    const finish = (result: ShownBeat | null) => {
      for (const key of path) active.delete(key);
      if (result && !looped) for (const key of path) memo.set(key, result);
      return result;
    };
    for (;;) {
      if ((steps += 1) > STEP_LIMIT) return finish(UNKNOWN);
      const chunks = at.sequence.arrays.chunks;
      while (at.entry < chunks.length && at.offset >= codeWords(chunks[at.entry]!)) {
        at.entry += 1;
        at.offset = 0;
      }
      const chunk = chunks[at.entry];
      if (!chunk) {
        const owner = root.ownerOf(at.sequence);
        if (!owner) return finish(OWN);
        const ownerChunk = owner.sequence.arrays.chunks[owner.entry]!;
        const block = at.sequence.block;
        if (blockFlags(ownerChunk, block) & BLOCK_FUNCTION) return finish(UNKNOWN);
        at.sequence = owner.sequence;
        at.entry = owner.entry;
        at.offset = blockField(ownerChunk, block, B_RESUME);
        continue;
      }
      const key = `${chunkId(chunk)}:${at.offset}`;
      const known = memo.get(key);
      if (known) return finish(known);
      if (active.has(key)) {
        looped = true;
        return finish(null);
      }
      active.add(key);
      path.push(key);
      const w0 = word(chunk, at.offset);
      const arg = word(chunk, at.offset + 1);
      const op = opOf(w0);
      if (isDisplay(root, chunk, at.offset)) {
        const outcome = outcomeOf(readCall(root, chunk, at.offset), addressOf(chunkId(chunk), callStart(root, chunk, at.offset)));
        if (outcome) return finish(outcome);
        at.offset += 2;
        continue;
      }
      switch (op) {
        case Op.Choice:
          return finish({ kind: "beat", address: addressOf(chunkId(chunk), at.offset) });
        case Op.Done:
        case Op.End:
          return finish(OWN);
        case Op.Jump:
          at.offset += 2 + arg;
          continue;
        case Op.JumpIfFalse:
        case Op.JumpIfKeep: {
          const taken = walk({ ...at, offset: at.offset + 2 + arg });
          const passed = walk({ ...at, offset: at.offset + 2 });
          if (taken === null) return finish(passed);
          if (passed === null) return finish(taken);
          return finish(same(taken, passed) ? taken : UNKNOWN);
        }
        case Op.JumpSym: {
          const place = root.place(arg);
          if (!place) return finish(UNKNOWN);
          return finish(walk({ sequence: place.sequence, entry: place.entry, offset: place.offset }));
        }
        case Op.EnterBlock: {
          if (blockFlags(chunk, arg) & BLOCK_FUNCTION) return finish(UNKNOWN);
          const body = root.body(chunk, arg);
          if (!body) {
            at.offset = blockField(chunk, arg, B_RESUME);
            continue;
          }
          return finish(walk({ sequence: body, entry: 0, offset: 0 }));
        }
        case Op.Leave: {
          const target = enclosingLoop(root, at.sequence);
          if (!target) return finish(UNKNOWN);
          const ownerChunk = target.sequence.arrays.chunks[target.entry]!;
          at.sequence = target.sequence;
          at.entry = target.entry;
          at.offset = blockField(ownerChunk, target.block, flagsOf(w0) & LEAVE_CONTINUE ? B_RESUME : B_BREAK);
          continue;
        }
        case Op.Call:
        case Op.CallVar:
          if (flagsOf(w0) & CALL_TUNNEL) return finish(UNKNOWN);
          at.offset += 2;
          continue;
        case Op.JumpVar:
        case Op.Return:
        case Op.TunnelReturn:
        case Op.Thread:
          return finish(UNKNOWN);
        default:
          at.offset += 2;
      }
    }
  };
  const after = walk({ ...start, offset: start.offset + 2 });
  return after ?? UNKNOWN;
};

const enclosingLoop = (
  root: ProgramRoot,
  sequence: SequenceRow,
): { sequence: SequenceRow; entry: number; block: number } | undefined => {
  for (let inner = sequence; ; ) {
    const owner = root.ownerOf(inner);
    if (!owner) return undefined;
    const ownerChunk = owner.sequence.arrays.chunks[owner.entry]!;
    const flags = blockFlags(ownerChunk, inner.block);
    if (flags & BLOCK_FUNCTION) return undefined;
    if (flags & BLOCK_LOOP) return { sequence: owner.sequence, entry: owner.entry, block: inner.block };
    inner = owner.sequence;
  }
};

const lastDisplayCall = (root: ProgramRoot, uri: string, range: BeatRange): At | undefined => {
  let found: { at: At; line: number; column: number } | undefined;
  const seen = new Set<number>();
  const within = (line: number, column: number) =>
    (line > range.startLine || (line === range.startLine && column >= range.startColumn)) &&
    (line < range.endLine || (line === range.endLine && column <= range.endColumn));
  const scan = (sequence: SequenceRow, entry: number) => {
    const chunk = sequence.arrays.chunks[entry]!;
    if (seen.has(chunkId(chunk))) return;
    seen.add(chunkId(chunk));
    for (let offset = 0; offset < codeWords(chunk); offset += 2) {
      if (!isDisplay(root, chunk, offset)) continue;
      const location = root.rangeAt(sequence, entry, callStart(root, chunk, offset));
      if (!location || !within(location.startLine, location.startColumn)) continue;
      if (
        !found ||
        location.startLine > found.line ||
        (location.startLine === found.line && location.startColumn >= found.column)
      ) {
        found = { at: { sequence, entry, offset }, line: location.startLine, column: location.startColumn };
      }
    }
  };
  for (let line = range.startLine; line <= range.endLine; line += 1) {
    const position = root.statementAt(uri, line);
    if (position) scan(position.sequence, position.entry);
  }
  return found?.at;
};
