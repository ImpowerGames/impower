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

// `display({ target?, character?, text, pause?, inherit?, group? })` with
// `shouldPopReturnedValue` — a synthesized bare-call statement (no author `&`
// needed). `display` is a
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
// `pause` marks a beat a `>` break ends: it waits for a click even when it
// shows no text. `open` marks a call that joins the next display call onto its
// line: `display` writes no newline after it, so the step runs on until a
// call closes the line. A trailing `..` and a divert the line holds open carry
// it. `caption` marks a `choose` block's last caption line, whose newline
// waits: the step completes with the choices unless the run shows something
// first. `group` names the glued continuation a call belongs to (its
// file and the offset it starts at, since offsets start again in every
// script), and
// `inherit` marks its beats after one of its breaks: they take the routing of
// the beat the run joined the continuation to, which the interpreter knows
// only while the beat `group` names is the one it queued last, and otherwise
// route by the table's own routing, which is the line the source reads before
// the continuation.
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
  options: {
    pause?: boolean;
    inherit?: boolean;
    group?: string;
    open?: boolean;
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
  for (const flag of ["pause", "inherit", "open"] as const) {
    if (options[flag]) entries.push(flagEntry(flag));
  }
  if (options.group != null) {
    entries.push(
      new ObjectExpressionEntry(
        "group",
        new StringExpression([new Text(options.group)]),
      ),
    );
  }
  return finishCall(entries, tags, range, ctx);
}

// `display({ parts })` for words whose `# tag`s sit between pieces of text (a
// picked choice's start content, then its chosen-only text). Each part is a
// run of text or a `{ tag }` table, in the order written, so text and tags are
// evaluated in that order. `display` joins the parts into `text` and `tags`
// before anything reads the table.
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

// Whether `call` is a `display` call whose table can take an `open` entry.
export function isDisplayCall(call: ParsedObject): call is FunctionCall {
  return (
    call instanceof FunctionCall &&
    call.name === "display" &&
    call.args[0] instanceof ObjectExpression
  );
}

// Mark a `display` call as a `choose` block's `caption`, whose newline waits
// for what the run does next. A call already `open` joins the next line
// instead and is left as it is.
export function captionDisplayCall(call: FunctionCall): void {
  const table = call.args[0] as ObjectExpression;
  if (table.entries.some((entry) => entry.key === "open")) return;
  table.addEntry(flagEntry("caption"));
}

function flagEntry(flag: string): ObjectExpressionEntry {
  return new ObjectExpressionEntry(flag, new NumberExpression(true, "bool"));
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
// for {@link buildDisplayCall}, and so is `open`, which a `load` line with a
// plain divert after it carries so the divert's first line joins the step.
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
  call.emitsLineStart = true;
  if (range) stampDebugMetadata([call], range.from, range.to, ctx);
  return call;
}
