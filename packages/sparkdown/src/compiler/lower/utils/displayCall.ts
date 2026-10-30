import { Expression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/Expression";
import { NumberExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/NumberExpression";
import { StringExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/StringExpression";
import {
  ObjectExpression,
  ObjectExpressionEntry,
} from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/ObjectExpression";
import { FunctionCall } from "../../../inkjs/compiler/Parser/ParsedHierarchy/FunctionCall";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { Tag } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Tag";
import { Text } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Text";
import type { LowerContext } from "../context";
import { stampDebugMetadata } from "./debugMetadata";

export class ContinuationGroup extends Text {
  override get isCompilerNamed(): boolean {
    return true;
  }
}

export function buildDisplayCall(
  target: string | undefined,
  character: string | undefined,
  body: ParsedObject[],
  range: { from: number; to: number } | null,
  ctx: LowerContext,
  tags: ParsedObject[][] = [],
  options: {
    pause?: boolean;
    extend?: boolean;
    glue?: boolean;
    inherit?: boolean;
    group?: string;
    open?: boolean;
    continues?: boolean;
  } = {},
): FunctionCall {
  const entries: ObjectExpressionEntry[] = [];
  if (target) {
    entries.push(
      new ObjectExpressionEntry(
        "target",
        new StringExpression([new Text(target)]),
      ),
    );
  }
  if (character) {
    entries.push(
      new ObjectExpressionEntry(
        "character",
        new StringExpression([new Text(character)]),
      ),
    );
  }
  entries.push(new ObjectExpressionEntry("text", new StringExpression(body)));
  for (const flag of [
    "pause",
    "extend",
    "glue",
    "inherit",
    "open",
    "continues",
  ] as const) {
    if (options[flag]) entries.push(flagEntry(flag));
  }
  if (options.group != null) {
    entries.push(
      new ObjectExpressionEntry(
        "group",
        new StringExpression([new ContinuationGroup(options.group)]),
      ),
    );
  }
  return finishCall(entries, tags, range, ctx);
}

export function buildOrderedDisplayCall(
  words: ParsedObject[],
  ctx: LowerContext,
  options: { open?: boolean } = {},
): FunctionCall {
  const parts: Expression[] = [];
  let run: ParsedObject[] = [];
  let tag: ParsedObject[] | null = null;
  for (const obj of words) {
    if (obj instanceof Tag) {
      if (obj.isStart) {
        if (run.length > 0) parts.push(new StringExpression(run));
        run = [];
        tag = [];
      } else if (tag) {
        parts.push(
          new ObjectExpression([
            new ObjectExpressionEntry("tag", new StringExpression(tag)),
          ]),
        );
        tag = null;
      }
    } else if (tag) {
      tag.push(obj);
    } else {
      run.push(obj);
    }
  }
  if (run.length > 0) parts.push(new StringExpression(run));
  const entries = [
    new ObjectExpressionEntry(
      "parts",
      new ObjectExpression(
        parts.map((part, i) => new ObjectExpressionEntry(String(i + 1), part)),
      ),
    ),
  ];
  if (options.open) entries.push(flagEntry("open"));
  return finishCall(entries, [], null, ctx);
}

export function buildUnjoinedWarning(
  range: { from: number; to: number },
  ctx: LowerContext,
): FunctionCall {
  const call = new FunctionCall(new Identifier("__unjoined"), []);
  call.shouldPopReturnedValue = true;
  stampDebugMetadata([call], range.from, range.to, ctx);
  return call;
}

export function isDisplayCall(call: ParsedObject): call is FunctionCall {
  return (
    call instanceof FunctionCall &&
    call.name === "display" &&
    call.args[0] instanceof ObjectExpression
  );
}

export function captionDisplayCall(call: FunctionCall): void {
  const table = call.args[0] as ObjectExpression;
  if (
    table.entries.some((entry) => entry.key === "open" || entry.key === "glue")
  ) {
    return;
  }
  table.addEntry(flagEntry("caption"));
}

function flagEntry(flag: string): ObjectExpressionEntry {
  return new ObjectExpressionEntry(flag, new NumberExpression(true, "bool"));
}

export function separateTags(objects: ParsedObject[]): {
  tags: ParsedObject[][];
  rest: ParsedObject[];
} {
  const tags: ParsedObject[][] = [];
  const rest: ParsedObject[] = [];
  let current: ParsedObject[] | null = null;
  for (const obj of objects) {
    if (obj instanceof Tag) {
      if (obj.isStart) {
        current = [];
      } else if (current) {
        tags.push(current);
        current = null;
      }
    } else if (current) {
      current.push(obj);
    } else {
      rest.push(obj);
    }
  }
  return { tags, rest };
}

export function buildLoadCall(
  args: ParsedObject[],
  range: { from: number; to: number } | null,
  ctx: LowerContext,
  tags: ParsedObject[][] = [],
  options: { open?: boolean } = {},
): FunctionCall {
  const entries = [new ObjectExpressionEntry("load", new StringExpression(args))];
  if (options.open) entries.push(flagEntry("open"));
  return finishCall(entries, tags, range, ctx);
}

function finishCall(
  entries: ObjectExpressionEntry[],
  tags: ParsedObject[][],
  range: { from: number; to: number } | null,
  ctx: LowerContext,
): FunctionCall {
  if (tags.length > 0) {
    entries.push(
      new ObjectExpressionEntry(
        "tags",
        new ObjectExpression(
          tags.map(
            (content, i) =>
              new ObjectExpressionEntry(
                String(i + 1),
                new StringExpression(content),
              ),
          ),
        ),
      ),
    );
  }
  const call = new FunctionCall(new Identifier("display"), [
    new ObjectExpression(entries),
  ]);
  call.shouldPopReturnedValue = true;
  if (range) stampDebugMetadata([call], range.from, range.to, ctx);
  return call;
}
