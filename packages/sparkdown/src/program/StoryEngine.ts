import type { CallStack } from "../runtime/CallStack";
import type { ErrorType, RaisedError } from "../runtime/Error";
import type { PushPopType } from "../runtime/PushPop";
import type { Simulator } from "../runtime/Simulator";
import type { ProgramAddress } from "../compiler/types/ProgramAddress";
import type { AbstractValue, ObjectValue, SymbolRef } from "../runtime/Value";
import type { VariablesState } from "../runtime/VariablesState";
import type { ProgramImage, ProgramImages } from "./ProgramImages";
import type { ProgramRoot } from "./ProgramRoot";
import type { BeatHistory } from "./ProgramStory";
import type { SaveHeader } from "./ProgramSave";
import type { ProgramChoice, ProgramStoryState } from "./ProgramStoryState";

export type StoryErrorHandler = (
  message: string,
  type: ErrorType,
  source?: unknown,
  raised?: RaisedError | null,
) => void;

export interface DebugFrame {
  readonly type: PushPopType;
  readonly symbol: number;
  readonly name: string;
  readonly scope: string;
  readonly address: number;
  readonly element: CallStack.Element;
}

export interface StoryEngine {
  readonly root: ProgramRoot;
  readonly state: ProgramStoryState;
  readonly variablesState: VariablesState;

  readonly canContinue: boolean;
  Continue(): string | null;
  ContinueAsync(): void;
  readonly asyncContinueComplete: boolean;
  CancelAsyncContinue(): void;
  readonly continueShowedSomething: boolean;
  ResetState(): void;
  ResetErrors(): void;
  readonly stateIsPristine: boolean;
  stepCount: number;
  stepLimit: number | null;

  readonly currentText: string | null;
  readonly currentTags: string[];
  readonly currentDisplayInstructions: ObjectValue[];
  readonly currentChoices: ProgramChoice[];
  processEscapes: boolean;
  collapseWhitespace: boolean;

  ChooseChoiceIndex(choiceIdx: number): void;
  ChooseChoice(choice: ProgramChoice): void;
  ChoosePathString(path: string, resetCallstack?: boolean, args?: any[]): void;
  ChooseAddress(address: number, resetCallstack?: boolean): void;

  readonly currentAddress: number;
  readonly previousAddress: number;
  stackAddresses(): number[];
  flowName(flow: number): string;
  debugFrames(threadIndex: number): DebugFrame[] | undefined;

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
  ): {
    ok: boolean;
    values: AbstractValue[];
    errorMessage?: string;
    errorValue?: AbstractValue;
  };

  Error(message: string, useEndLineNumber?: boolean): never;
  ErrorFrom(message: string, cause: unknown): never;
  Warning(message: string): void;
  AddError(message: string, isWarning?: boolean, useEndLineNumber?: boolean): void;
  CallStackTrace(): string;
  CallFrameCount(): number;
  CallFramePath(index: number): string | null;
  CallFrameName(index: number): string | null;
  FunctionLabel(ref: SymbolRef): string;
  onError: StoryErrorHandler | null;
  errorMessageFormatter?: (story: any, message: string) => string;
  errorCalledByBuiltin?: boolean;

  onExecute: ((address: number) => void) | null;
  executedLog: number[] | null;
  beatLog: number[] | null;
  onMakeChoice: ((choice: ProgramChoice) => void) | null;
  onEvaluateCondition: ((value: boolean) => void) | null;

  simulator: Simulator | null;
  pauseBeforeEvaluatingConditions: boolean;
  pausedBeforeCondition: ProgramAddress | null;
  pausedConditionValue: boolean | null;

  keepBeatImages: boolean;
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
