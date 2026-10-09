import type { CallStack } from "../runtime/CallStack";
import type { ErrorType, RaisedError } from "../runtime/Error";
import type { PushPopType } from "../runtime/PushPop";
import type { Simulator } from "../runtime/Simulator";
import type { AbstractValue, ObjectValue } from "../runtime/Value";
import type { VariablesState } from "../runtime/VariablesState";
import type { ProgramImage, ProgramImages } from "./ProgramImages";
import type { ProgramRoot } from "./ProgramRoot";
import type { BeatHistory } from "./ProgramStory";
import type { SaveHeader } from "./ProgramSave";
import type { ProgramChoice, ProgramStoryState } from "./ProgramStoryState";

/** Reports a story's error or warning, with what raised it. */
export type StoryErrorHandler = (
  message: string,
  type: ErrorType,
  source?: unknown,
  raised?: RaisedError | null,
) => void;

/** One call frame as the debugger reads it (`StoryEngine.debugFrames`). */
export interface DebugFrame {
  /** Whether the frame runs a function or a tunnel; the flow's own frame
   *  is a tunnel's, as on the object engine. */
  readonly type: PushPopType;
  /** The symbol of the function or tunnel the frame runs, or of the flow
   *  the flow's own frame stands in (-1 for a declaration). */
  readonly symbol: number;
  /** The frame's name as an author reads it: a function the compiler named
   *  shows as anonymous (`readableSymbolLabel`). */
  readonly name: string;
  /** The frame's identity as a temporary's scope and a data breakpoint name
   *  it: the label the program holds, which keeps two functions the
   *  compiler named apart. */
  readonly scope: string;
  /** The address the frame stands at, or -1 when it stands nowhere. */
  readonly address: number;
  /** The call stack element whose scopes hold the frame's temporaries. */
  readonly element: CallStack.Element;
}

/**
 * What a game, the route planner and the standard library run a story
 * through (docs/engine/binary-program.md, section 9, The Story surface): the
 * binary program's engine (`ProgramStory`) is its one implementer. A
 * position is an address (section 8), a checkpoint an image of a beat and a
 * save a durable save of the beats before it (section 7).
 */
export interface StoryEngine {
  /** The program the story runs. */
  readonly root: ProgramRoot;
  /** The story's state: its call stack, output and choices. */
  readonly state: ProgramStoryState;
  /** The story's globals. */
  readonly variablesState: VariablesState;

  // Running.
  readonly canContinue: boolean;
  Continue(): string | null;
  ContinueAsync(): void;
  readonly asyncContinueComplete: boolean;
  CancelAsyncContinue(): void;
  /** Whether the last continue showed a beat. */
  readonly continueShowedSomething: boolean;
  ResetState(): void;
  ResetErrors(): void;
  /** Whether nothing has run, been loaded or been written since the last
   *  reset. */
  readonly stateIsPristine: boolean;
  /** How many instructions the story has run, and how many it may run
   *  before it stops with an error. */
  stepCount: number;
  stepLimit: number | null;

  // What a beat shows.
  readonly currentText: string | null;
  readonly currentTags: string[];
  readonly currentDisplayInstructions: ObjectValue[];
  readonly currentChoices: ProgramChoice[];
  processEscapes: boolean;
  collapseWhitespace: boolean;

  // Moving.
  ChooseChoiceIndex(choiceIdx: number): void;
  ChooseChoice(choice: ProgramChoice): void;
  /** Moves to the flow a qualified symbol name names. */
  ChoosePathString(path: string, resetCallstack?: boolean, args?: any[]): void;
  ChooseAddress(address: number, resetCallstack?: boolean): void;

  // Where the story stands (section 8).
  readonly currentAddress: number;
  readonly previousAddress: number;
  stackAddresses(): number[];
  flowName(flow: number): string;
  debugFrames(threadIndex: number): DebugFrame[] | undefined;

  // Functions.
  HasFunction(functionName: string): boolean;
  EvaluateFunction(
    functionName: string,
    args?: any[],
    returnTextOutput?: boolean,
  ): any;
  CallLuauFunction(fnValue: AbstractValue, args: AbstractValue[]): AbstractValue[];
  CallLuauFunctionProtected(
    fnValue: AbstractValue,
    args: AbstractValue[],
  ): { ok: boolean; values: AbstractValue[]; errorMessage?: string };

  // Errors, and the call stack the standard library's `debug` builtins read.
  Error(message: string, useEndLineNumber?: boolean): never;
  /** Raises `message` for an error a Luau callback raised (`cause`), at the
   *  instruction that raised it. */
  ErrorFrom(message: string, cause: unknown): never;
  Warning(message: string): void;
  AddError(message: string, isWarning?: boolean, useEndLineNumber?: boolean): void;
  CallStackTrace(): string;
  CallFrameCount(): number;
  CallFramePath(index: number): string | null;
  onError: StoryErrorHandler | null;
  errorMessageFormatter?: (story: any, message: string) => string;

  // What a game hears as the story runs.
  onExecute: ((address: number) => void) | null;
  executedLog: number[] | null;
  onMakeChoice: ((choice: ProgramChoice) => void) | null;
  onEvaluateCondition: ((value: boolean) => void) | null;

  // The route planner's control (section 9, `planRoute.ts`).
  simulator: Simulator | null;
  pauseBeforeEvaluatingConditions: boolean;
  /** The address of the decision a continue stopped before, as a string. */
  pausedBeforeCondition: string | null;

  // Checkpoints and saves (section 7).
  keepBeatImages: boolean;
  /** The beats the story keeps restorable. */
  readonly history: BeatHistory;
  readonly images: ProgramImages;
  capture(keyframe?: boolean): ProgramImage;
  captureBeat(keyframe?: boolean): ProgramImage;
  canRestore(image: ProgramImage, translate?: boolean): boolean;
  restore(image: ProgramImage, translate?: boolean): boolean;
  saveOfImage(image: ProgramImage, gameVersion?: string, withHistory?: boolean): string | null;
  toSave(gameVersion?: string): string;
  loadSave(json: string): SaveHeader;
  checkSave(json: string): void;
}
