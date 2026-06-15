import { Argument } from "../Argument";
import { FlowBase } from "./FlowBase";
import { FlowLevel } from "./FlowLevel";
import { Identifier } from "../Identifier";
import { ParsedObject } from "../Object";

// A nestable callable scope. Compiles to a named runtime Container
// with arg binding at entry and PopFunction at flow end — same shape
// as a top-level function knot. Unlike Knot/Stitch, a `Function` can
// live inside any other FlowBase (Knot, Stitch, or another Function)
// and at arbitrary nesting depth. Path resolution permits same-level
// Function-after-Function lookup (see Path.ResolveTailComponents).
//
// Used by sparkdown lowering for:
//   - Anonymous function literals (`function() ... end` expressions).
//   - Named nested function definitions (`function f() ... end` inside
//     another function's body).
//   - Class method definitions (planned).
//
// Always has `isFunction = true` — there is no "narrative" variant.
// If a non-function nestable scope ever becomes useful, introduce a
// sibling class rather than reusing this one.
export class Function extends FlowBase {
  get flowLevel(): FlowLevel {
    return FlowLevel.Function;
  }

  constructor(
    name: Identifier,
    topLevelObjects: ParsedObject[],
    args: Argument[],
  ) {
    super(name, topLevelObjects, args, true);
  }

  get typeName(): string {
    return "Function";
  }
}
