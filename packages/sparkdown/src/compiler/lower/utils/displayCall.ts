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

// `display({ target?, character?, text })` with `shouldPopReturnedValue` — a
// synthesized bare-call statement (no author `&` needed). `display` is a
// state-aware STDLIB entry, so this lowers to a RunStdLibFunction dispatch whose
// live ObjectValue arg the engine reads via `story.currentDisplayInstructions`.
// `text` is a StringExpression over the body's own ParsedObjects, so ink
// evaluates interpolation to live values and concatenates the run at call time.
// A table with no `target` renders on the interpreter's default target.
//
// `tags` holds the line's author `# tag`s, each as the content of one tag. They
// ride the table as `tags`, evaluated after `text` as the author wrote them, and
// `display` puts them on the stream ahead of the table, so they land in the
// same step's `currentTags`. A tag cannot sit inside the captured `text`: a tag
// ending during string evaluation is taken for a choice label's tag.
//
// When `range` is given, the call is stamped with it so its beat surfaces a
// pathLocation (the screenplay preview's click-to-line routing depends on it).
export function buildDisplayCall(
  target: string | undefined,
  character: string | undefined,
  body: ParsedObject[],
  range: { from: number; to: number } | null,
  ctx: LowerContext,
  tags: ParsedObject[][] = [],
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
  return finishCall(entries, tags, range, ctx);
}

// Split parsed objects into their `# tag`s (the content between each
// `Tag(true)` and `Tag(false)`) and everything else, both in order.
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

// `display({ load })`: the interpreter queues the names as a load beat of its
// own. The names are a captured string, so they may interpolate. `tags` are as
// for {@link buildDisplayCall}.
export function buildLoadCall(
  args: ParsedObject[],
  range: { from: number; to: number } | null,
  ctx: LowerContext,
  tags: ParsedObject[][] = [],
): FunctionCall {
  return finishCall(
    [new ObjectExpressionEntry("load", new StringExpression(args))],
    tags,
    range,
    ctx,
  );
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
