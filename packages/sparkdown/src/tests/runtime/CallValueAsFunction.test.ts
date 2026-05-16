// Pressure-test for `CallValueAsFunction` — the runtime piece that lets you
// invoke a function whose target is a `DivertTargetValue` sitting on the
// evaluation stack at runtime (as opposed to a compile-time-bound name).
//
// We build the smallest possible runtime story by hand:
//
//   ev
//   <a>           push the argument
//   <fn-target>   push a DivertTargetValue pointing at `double`
//   call          pops the target, diverts, pushes Function frame
//   /ev
//
// The function `double`:
//   ev
//   temp= x       pop the only arg into a local
//   ev_start
//   x ref         push x
//   2 (int)       push 2
//   *             multiply
//   eval_output   emit
//   /ev
//   ~ret          pop the Function frame, returning to caller
//
// We then continue the story and assert the printed output is "10" when
// called with 5.

import "../../inkjs/compiler/Compiler"; // primes class load order (see compileSnapshot)
import { describe, expect, test } from "vitest";
import { Container } from "../../inkjs/engine/Container";
import { ControlCommand } from "../../inkjs/engine/ControlCommand";
import { DivertTargetValue, IntValue, StringValue } from "../../inkjs/engine/Value";
import { NativeFunctionCall } from "../../inkjs/engine/NativeFunctionCall";
import { Path } from "../../inkjs/engine/Path";
import { Story } from "../../inkjs/engine/Story";
import { VariableAssignment } from "../../inkjs/engine/VariableAssignment";
import { VariableReference } from "../../inkjs/engine/VariableReference";

describe("CallValueAsFunction control command", () => {
  test("serializes as 'call' in the control-command name table", () => {
    // Round-trip through JSON: a Container containing a single CallValueAsFunction
    // command should serialize with the string "call".
    const root = new Container();
    root.AddContent(ControlCommand.CallValueAsFunction());

    const story = synthesizeStory(root);
    const json = story.ToJson();
    expect(json).toContain('"call"');
  });

  test("dispatches to a function via a DivertTargetValue on the eval stack", () => {
    // Build the function: `double(x) { return x * 2 }`. We construct the
    // function body at runtime-object level rather than going through the
    // ParsedHierarchy, since this test is pressure-testing the engine path,
    // not the lowerer.
    //
    // Function entry pops the arg into `x` (via `temp= x`), then computes
    // `x * 2`, marks it for output, and returns.
    const doubleFn = new Container();
    doubleFn.name = "double";
    // Parameter binding: pop top of eval stack into temp `x`.
    doubleFn.AddContent(new VariableAssignment("x", true));
    // Body: ev; x; 2; *; out; /ev; ~ret
    doubleFn.AddContent(ControlCommand.EvalStart());
    doubleFn.AddContent(new VariableReference("x"));
    doubleFn.AddContent(new IntValue(2));
    doubleFn.AddContent(NativeFunctionCall.CallWithName("*"));
    doubleFn.AddContent(ControlCommand.EvalOutput());
    doubleFn.AddContent(ControlCommand.EvalEnd());
    doubleFn.AddContent(ControlCommand.PopFunction());

    // Caller bytecode: push arg (5), push DivertTargetValue → double, call.
    const main = new Container();
    main.AddContent(ControlCommand.EvalStart());
    main.AddContent(new IntValue(5));
    main.AddContent(new DivertTargetValue(new Path("double")));
    main.AddContent(ControlCommand.CallValueAsFunction());
    main.AddContent(ControlCommand.EvalEnd());

    // Root container holds the main flow inline, plus the named `double`
    // function attached as named-only content (so it's reachable by path but
    // doesn't run sequentially after the main flow finishes).
    const root = new Container();
    root.AddContent(main);
    root.AddToNamedContentOnly(doubleFn);
    // End the main flow explicitly so the runtime knows where the top-level
    // narrative stops — without this, after the called function returns and
    // the eval block closes, the runtime keeps walking and eventually trips
    // an "expected end of flow" guard.
    root.AddContent(ControlCommand.End());

    const story = synthesizeStory(root);
    // Run until output is produced.
    const text = story.ContinueMaximally();
    expect(text.trim()).toBe("10");
  });

  test("throws on non-DivertTargetValue", () => {
    const main = new Container();
    main.AddContent(ControlCommand.EvalStart());
    main.AddContent(new StringValue("not a target"));
    main.AddContent(ControlCommand.CallValueAsFunction());
    main.AddContent(ControlCommand.EvalEnd());

    const root = new Container();
    root.AddContent(main);

    const story = synthesizeStory(root);
    expect(() => story.ContinueMaximally()).toThrow(
      /call a non-function value as a function/,
    );
  });
});

// Round-trip the runtime container through `Story.ToJson` / `new Story(json)`
// so we exercise the same code path real-world stories take.
function synthesizeStory(root: Container): Story {
  // Stub-construct a minimal story directly from the root container. The
  // Story(Container, ...) form expects the root to already be a fully
  // realized runtime tree.
  // Pass empty arrays (not null) for lists/structs so the runtime's variable
  // lookup has an empty `ListDefinitionsOrigin` to consult — without it, a
  // missed global lookup hits a `_listDefsOrigin === null` throw inside
  // `VariablesState.GetRawVariableWithName` before it can fall through to
  // the call-stack temp-variable check.
  const story = new Story(root, [], []);
  // The Container-form constructor does NOT call `ResetState` (only the JSON
  // form does), so initialize state manually before execution.
  story.ResetState();
  return story;
}
