# The runtime layer

What the binary program's engine (`../program/ProgramStory.ts`) runs on and keeps once #705 deletes the object-hierarchy engine (`../inkjs/engine/`): the value model and its operators (`Value.ts`, `NativeFunctionCall.ts`, `MethodDispatch.ts`), the standard library (`StdLib.ts`, `LuaPatterns.ts`, `PluralRules.ts`), the evaluation helpers both engines call (`evaluation.ts`), the variables and the call stack a story's state holds (`VariablesState.ts`, `CallStack.ts`), saves and their JSON (`JsonSerialisation.ts`, `SimpleJson.ts`), the markers a story writes into its output (`ControlCommand.ts`), the errors a story raises, and `StoryEngine`, the surface a game and the standard library call a story through.

These files began as the [inkjs](https://github.com/y-lohse/inkjs/) runtime and keep its MIT license (`LICENSE`); `../inkjs/README.md` lists what Sparkdown changed.

Until #705's deletion, a few of these files still import the object hierarchy that stays in `../inkjs/engine/` (a value's place in a container, a pointer into one, the current engine's state). `../tests/runtime/runtimeLayerBoundary.test.ts` lists each such import; the deletion removes them, and the list ends empty.
