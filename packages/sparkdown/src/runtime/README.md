# The runtime layer

What the binary program's engine (`../program/ProgramStory.ts`) runs on, which is what it kept when #705 deleted the object-hierarchy engine (`../inkjs/engine/`): the value model and its operators (`Value.ts`, `NativeFunctionCall.ts`, `MethodDispatch.ts`), the standard library (`StdLib.ts`, `LuaPatterns.ts`, `PluralRules.ts`), the evaluation helpers the engine calls (`evaluation.ts`), the variables and the call stack a story's state holds (`VariablesState.ts`, `CallStack.ts`), saves and their JSON (`JsonSerialisation.ts`, `SimpleJson.ts`), the markers a story writes into its output (`ControlCommand.ts`), the errors a story raises, and `StoryEngine`, the surface a game and the standard library call a story through.

These files began as the [inkjs](https://github.com/y-lohse/inkjs/) runtime and keep its MIT license (`LICENSE`); `../inkjs/README.md` lists what Sparkdown changed.

The object hierarchy and its engine imports were removed in #705. This layer supports `ProgramStory` without depending on `../inkjs/engine/`.
