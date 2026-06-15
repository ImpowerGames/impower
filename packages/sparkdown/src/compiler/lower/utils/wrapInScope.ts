import { ControlCommand as RuntimeControlCommand } from "../../../inkjs/engine/ControlCommand";
import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { Wrap } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Wrap";

// Wraps a body of parsed objects in `BeginScope` / `EndScope` control
// commands so temporary-variable declarations (`local x = ...`) inside
// the body follow Luau's block-scoping rules: an inner `local x`
// shadows an outer `x` for the duration of the body, and the outer is
// visible again afterward. Emit this around every block-introducing
// construct (`if`/`elseif`/`else`/`for`/`while`/`repeat`/`do`) so
// authors don't get ink's function-scoped surprise.
//
// Empty bodies are still wrapped — the push/pop pair is a no-op at
// runtime but keeps the bytecode shape consistent.
export function wrapInScope(body: ParsedObject[]): ParsedObject[] {
  return [
    new Wrap(RuntimeControlCommand.BeginScope()),
    ...body,
    new Wrap(RuntimeControlCommand.EndScope()),
  ];
}
