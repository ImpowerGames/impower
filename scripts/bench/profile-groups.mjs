// How profile-shares.mjs divides the story engine's stepping time (#664). Each
// entry is [group, RegExp over `<source file>:<function>`]; the first match
// wins, and a function no entry matches is listed as unassigned.
//
// V8 inlines small functions into their callers, and an inlined function's
// time is charged to the caller. `Pointer.Resolve` all but disappears into
// `Story.Step` that way, so the functions that walk the hierarchy and also
// dispatch content form a group of their own instead of being forced into
// either side.

const REPRESENTATION = "the program is an object hierarchy";
const ANY_ENGINE = "work any engine does";
const MIXED = "both, inseparable after inlining";
const DRIVER = "neither: cost of driving one step per call";

export const STEPPING = [
  // Paths and path strings, pointers, resolving a path to a container, looking
  // a child up by name.
  [REPRESENTATION, /^Path\.ts:/],
  [REPRESENTATION, /^Pointer\.ts:/],
  [REPRESENTATION, /^SearchResult\.ts:/],
  [REPRESENTATION, /^Container\.ts:/],
  [REPRESENTATION, /^Object\.ts:/],
  [REPRESENTATION, /^Story\.ts:(PointerAtPath|ContentAtPath|KnotContainerWithName|VisitChangedContainersDueToDivert|VisitContainer)$/],
  [REPRESENTATION, /^StoryState\.ts:((get|set) (currentPointer|previousPointer|divertedPointer)|SetChosenPath)$/],
  // Finding out what a content object is by testing its class.
  [REPRESENTATION, /^TypeAssertion\.ts:/],
  // Allocating call stack elements and threads, value wrappers, and the state
  // objects copied for the look-ahead past a newline.
  [REPRESENTATION, /^CallStack\.ts:/],
  [REPRESENTATION, /^Value\.ts:(_?[A-Z]\w*Value\d*|Value|Create|get valueObject|get valueType)$/],
  [REPRESENTATION, /^Void\.ts:/],
  [REPRESENTATION, /^(StatePatch|Flow|PRNG)\.ts:/],
  [REPRESENTATION, /^StoryState\.ts:(_?StoryState\d*|CopyAndStartPatching|RestoreAfterPatch|ApplyAnyPatch)$/],
  [REPRESENTATION, /^VariablesState\.ts:(_?VariablesState\d*|set callStack|set patch|get patch)$/],
  [REPRESENTATION, /^Story\.ts:(StateSnapshot|RestoreStateSnapshot|DiscardSnapshot)$/],

  [MIXED, /^Story\.ts:(Step|NextContent|IncrementContentPointer|PerformLogicAndFlowControl)$/],

  // The route planner asks for one step per call, and every call starts a
  // stopwatch and runs the checks that bracket a whole line.
  [DRIVER, /^StopWatch\.ts:/],
  [DRIVER, /^Story\.ts:(ContinueAsync|ContinueInternal|ValidateExternalBindings|IfAsyncWeCant|get asyncContinueComplete)$/],
  [DRIVER, /^(engineBench|bufferStepBench)\.ts:/],

  // Output text, the evaluation stack, variables, builtins, line ends,
  // choices, errors.
  [ANY_ENGINE, /^(ControlCommand|TryGetResult|StoryState|VariablesState|Story|StdLib|NativeFunctionCall|StringBuilder|Value|Tag|Glue|Choice|ChoicePoint|Divert|VariableAssignment|VariableReference|LuauTruthiness|MethodDispatch|StructDefinition|InkList|planRoute|Simulator)\.ts:/],
];
