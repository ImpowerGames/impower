import { StringExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/StringExpression";
import {
  ObjectExpression,
  ObjectExpressionEntry,
} from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/ObjectExpression";
import { FunctionCall } from "../../../inkjs/compiler/Parser/ParsedHierarchy/FunctionCall";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { Text } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Text";
import type { LowerContext } from "../context";
import { stampDebugMetadata } from "./debugMetadata";

// `display({ target?, character?, text })` with `shouldPopReturnedValue` — a
// synthesized bare-call statement (no author `&` needed). `display` is a
// state-aware STDLIB entry, so this lowers to a RunStdLibFunction dispatch whose
// live ObjectValue arg the engine reads via `story.currentDisplayInstructions`.
// `text` is a StringExpression over the body's own ParsedObjects, so ink
// evaluates interpolation to live values and concatenates the run at call time.
// A table with no `target` renders on the interpreter's default target.
//
// When `range` is given, the call is stamped with it so its beat surfaces a
// pathLocation (the screenplay preview's click-to-line routing depends on it).
export function buildDisplayCall(
  target: string | undefined,
  character: string | undefined,
  body: ParsedObject[],
  range: { from: number; to: number } | null,
  ctx: LowerContext,
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
  return finishCall(entries, range, ctx);
}

// `display({ load })`: the interpreter queues the names as a load beat of its
// own. The names are a captured string, so they may interpolate.
export function buildLoadCall(
  args: ParsedObject[],
  range: { from: number; to: number } | null,
  ctx: LowerContext,
): FunctionCall {
  return finishCall(
    [new ObjectExpressionEntry("load", new StringExpression(args))],
    range,
    ctx,
  );
}

function finishCall(
  entries: ObjectExpressionEntry[],
  range: { from: number; to: number } | null,
  ctx: LowerContext,
): FunctionCall {
  const call = new FunctionCall(new Identifier("display"), [
    new ObjectExpression(entries),
  ]);
  call.shouldPopReturnedValue = true;
  if (range) stampDebugMetadata([call], range.from, range.to, ctx);
  return call;
}
