// Translates `<receiver>.<method>(args)` source calls (e.g.
// `math.floor(x)`, `story.turns()`) to the runtime builtin name
// registered by the engine's stdlib bridge. The two underlying tables
// (`STDLIB` for pure JS functions, `INK_BUILTIN_ALIASES` for aliases of
// existing ink runtime builtins) live in `inkjs/engine/StdLib.ts`;
// adding a new method there is the single source of truth — this
// lowerer reads from the same registry, so the compiler and runtime
// stay in sync.

import { lookupStdLibBuiltin } from "../../../inkjs/engine/StdLib";

// Returns the runtime builtin name for a `receiver.method(args)` call if
// one exists, or `null` if the receiver/method/arity combination isn't
// registered (in which case the lowerer should fall through to its
// regular flat-namespace method-call desugar). `argCount` is consulted
// for arity-overloaded entries like `story.turns` — see `StdLib.ts`.
export function mapStdLibCallToBuiltin(
  receiverName: string,
  methodName: string,
  argCount: number,
): string | null {
  return lookupStdLibBuiltin(receiverName, methodName, argCount);
}
