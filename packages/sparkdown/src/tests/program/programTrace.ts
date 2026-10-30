import { ControlCommand } from "../../runtime/ControlCommand";
import type { InkObject } from "../../runtime/Object";
import {
  FloatValue,
  MultiValue,
  NullValue,
  ObjectValue,
  StringValue,
  Value,
} from "../../runtime/Value";
import { Void } from "../../runtime/Void";
import { ParsedObject } from "../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { describeInstruction } from "../../program/BinaryProgramWriter";
import { ChunkStore } from "../../program/ChunkStore";
import type { ProgramEmitter } from "../../program/ProgramEmitter";
import { ProgramStory } from "../../program/ProgramStory";
import type { ProgramRoot, SequenceRow } from "../../program/ProgramRoot";
import { SymbolKind } from "../../program/ProgramSymbols";

class HandWritten extends ParsedObject {
  constructor(protected _emit: (emitter: ProgramEmitter) => void) {
    super();
  }
  override EmitProgram(emitter: ProgramEmitter): void {
    this._emit(emitter);
  }
}

export function handWrittenProgram(
  emit: (emitter: ProgramEmitter) => void,
): ProgramRoot {
  const { root, unsupported } = new ChunkStore().build(
    [
      {
        name: "",
        kind: SymbolKind.Root,
        uri: "inmemory:///hand.sd",
        firstLine: 0,
        span: 1,
        statements: [
          {
            block: {},
            objects: [new HandWritten(emit)],
            range: null,
            firstLine: 0,
            source: () => "",
            syntax: () => "",
            reads: "",
          },
        ],
      },
    ],
    true,
  );
  if (!root) {
    throw new Error(`the hand-written statement holds a construct the writer cannot emit: ${unsupported?.construct}`);
  }
  return root;
}

export const traceHandWritten = (
  emit: (emitter: ProgramEmitter) => void,
): TracedStep[] => traceSteps(new ProgramStory(handWrittenProgram(emit)));

export interface TracedStep {
  op: string;
  stack: string[];
  output: string[];
  scopes: Record<string, string>[];
  blocks: number;
}

export const showValue = (obj: InkObject | null | undefined): string => {
  if (!obj) {
    return "none";
  }
  if (obj instanceof StringValue) {
    return JSON.stringify(obj.value);
  }
  if (obj instanceof ObjectValue) {
    return `{${[...(obj.value?.entries() ?? [])]
      .map(([key, value]) => `${key}=${showValue(value)}`)
      .join(",")}}`;
  }
  if (obj instanceof MultiValue) {
    return `(${obj.values.map(showValue).join(",")})`;
  }
  if (obj instanceof NullValue) {
    return "nil";
  }
  if (obj instanceof Void) {
    return "void";
  }
  if (obj instanceof ControlCommand) {
    return `<${ControlCommand.CommandType[obj.commandType]}>`;
  }
  if (obj instanceof FloatValue && Number.isInteger(obj.value)) {
    return `${obj.value}.0`;
  }
  if (obj instanceof Value) {
    return String(obj.valueObject);
  }
  return obj.constructor.name;
};

type Running = { sequence: SequenceRow; entry: number; offset: number } | null;

export function traceSteps(story: ProgramStory, max = 1000): TracedStep[] {
  const steps: TracedStep[] = [];
  const running = () => (story as unknown as { _running: Running })._running;
  for (let n = 0; n < max && story.state.position; n += 1) {
    const before = running();
    story.Step();
    const ran = running();
    if (!ran || ran === before) {
      continue;
    }
    const chunk = ran.sequence.arrays.chunks[ran.entry]!;
    const frame = story.state.frame;
    steps.push({
      op: describeInstruction(chunk, ran.offset, story.root.table),
      stack: story.state.evaluationStack.map(showValue),
      output: story.state.outputStream.map(showValue),
      scopes: (frame?.temporaryScopes ?? []).map((scope) =>
        Object.fromEntries(
          [...scope.entries()].map(([name, value]) => [name, showValue(value)]),
        ),
      ),
      blocks: story.state.blockStack.length,
    });
  }
  return steps;
}
