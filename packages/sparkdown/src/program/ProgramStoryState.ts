// Loads the engine's modules in the order that settles their import cycle
// (see `CompilationAnnotator`).
import "../inkjs/engine/Container";
import { ControlCommand } from "../inkjs/engine/ControlCommand";
import type { RaisedError } from "../inkjs/engine/Error";
import { JsonSerialisation } from "../inkjs/engine/JsonSerialisation";
import type { InkObject } from "../inkjs/engine/Object";
import { PRNG } from "../inkjs/engine/PRNG";
import { SimpleJson } from "../inkjs/engine/SimpleJson";
import { StringBuilder } from "../inkjs/engine/StringBuilder";
import { Tag } from "../inkjs/engine/Tag";
import { ObjectValue, StringValue } from "../inkjs/engine/Value";
import type { VariablesState } from "../inkjs/engine/VariablesState";
import { splitHeadTailWhitespace } from "../inkjs/engine/outputWhitespace";
import type { ProgramRoot, SequenceRow } from "./ProgramRoot";
import { chunkId } from "./StatementChunk";

/** Where the engine stands: an entry of a sequence and an offset into that
 *  entry's code. An offset past the end of a chunk's code is the start of the
 *  next entry. */
export interface ProgramPosition {
  sequence: SequenceRow;
  entry: number;
  offset: number;
}

/** The output a cut carried to the next continue, and whether its own line
 *  waits for its newline (`StoryState.CarryOutputPastCut`). */
interface CarriedStep {
  output: InkObject[];
  lineEndPending: boolean;
}

/** What the program engine's state hands a caller that reads a story's
 *  pointer: it names no runtime path. */
export const NO_POINTER = Object.freeze({
  isNull: true,
  path: null,
  container: null,
  copy() {
    return NO_POINTER;
  },
});

/**
 * The state of the program engine: its position, eval stack and output, the
 * errors of the continue in progress, and the globals.
 *
 * The output is the current engine's, member for member, so that the builtins
 * a chunk calls (`display`) read and write it as they read and write a
 * `StoryState`: the newline rule and the splitting of a pushed string's
 * surrounding whitespace (`PushToOutputStreamIndividual`,
 * `TrySplittingHeadTailWhitespace`), a line end that waits (`lineEndPending`),
 * the offer to join a line that begins with `..` (`lineJoinable`), and the
 * cut that ends a continue at a waiting line end when something shows, whose
 * output is carried to the next continue.
 */
export class ProgramStoryState {
  position: ProgramPosition | null = null;
  evaluationStack: InkObject[] = [];
  outputStream: InkObject[] = [];
  lineEndPending = false;
  lineJoinable = false;
  outputCut: number | null = null;
  carried: CarriedStep | null = null;
  didSafeExit = false;
  currentTurnIndex = -1;
  storySeed: number;
  previousRandom = 0;

  protected _currentErrors: string[] | null = null;
  protected _currentWarnings: string[] | null = null;
  protected _raisedErrors: RaisedError[] = [];
  protected _raisedWarnings: RaisedError[] = [];

  /** `_noteChanged` tells the story its state is no longer the one a reset
   *  made, as a load does (`Story.NoteStateChanged`). */
  constructor(
    protected _root: ProgramRoot,
    public variablesState: VariablesState,
    protected _cleanWhitespace: (text: string) => string,
    protected _noteChanged: () => void = () => {},
  ) {
    this.storySeed = new PRNG(new Date().getTime()).next() % 100;
  }

  get canContinue(): boolean {
    return this.position !== null && !this.hasError;
  }

  get currentErrors() {
    return this._currentErrors;
  }

  get currentWarnings() {
    return this._currentWarnings;
  }

  get raisedErrors() {
    return this._raisedErrors;
  }

  get raisedWarnings() {
    return this._raisedWarnings;
  }

  get hasError(): boolean {
    return this._currentErrors != null && this._currentErrors.length > 0;
  }

  get hasWarning(): boolean {
    return this._currentWarnings != null && this._currentWarnings.length > 0;
  }

  AddError(message: string, isWarning: boolean, raised: RaisedError): void {
    if (!isWarning) {
      if (this._currentErrors == null) this._currentErrors = [];
      this._currentErrors.push(message);
      this._raisedErrors[this._currentErrors.length - 1] = raised;
    } else {
      if (this._currentWarnings == null) this._currentWarnings = [];
      this._currentWarnings.push(message);
      this._raisedWarnings[this._currentWarnings.length - 1] = raised;
    }
  }

  ResetErrors(): void {
    this._currentErrors = null;
    this._currentWarnings = null;
    this._raisedErrors = [];
    this._raisedWarnings = [];
  }

  // Choices are not emitted yet, so none is ever raised.
  get currentChoices(): never[] {
    return [];
  }

  get generatedChoices(): never[] {
    return [];
  }

  // The engine runs one flow at a time, with no call stack yet.
  get callstackDepth(): number {
    return 1;
  }

  get currentPointer() {
    return this.position ? { ...NO_POINTER, isNull: false } : NO_POINTER;
  }

  get previousPointer() {
    return NO_POINTER;
  }

  get currentPathString(): string | null {
    return null;
  }

  // ------------------------------------------------------------- the output

  PushEvaluationStack(obj: InkObject): void {
    this.evaluationStack.push(obj);
  }

  PopEvaluationStack(): InkObject {
    if (this.evaluationStack.length === 0) {
      throw new Error("trying to pop too many objects");
    }
    return this.evaluationStack.pop()!;
  }

  ResetOutput(objs: InkObject[] | null = null): void {
    this.outputStream.length = 0;
    if (objs !== null) this.outputStream.push(...objs);
    this.OutputStreamDirty();
  }

  PushToOutputStream(obj: InkObject | null): void {
    if (!this.inStringEvaluation && showsOutput(obj)) {
      this.lineJoinable = false;
      if (this.lineEndPending) {
        this.lineEndPending = false;
        this.outputCut = this.outputStream.length;
      }
    }
    if (obj instanceof StringValue) {
      if (this.inStringEvaluation) {
        this.outputStream.push(obj);
        this.OutputStreamDirty();
        return;
      }
      const listText = this.TrySplittingHeadTailWhitespace(obj);
      if (listText !== null) {
        for (const textObj of listText) {
          this.PushToOutputStreamIndividual(textObj);
        }
        this.OutputStreamDirty();
        return;
      }
    }
    this.PushToOutputStreamIndividual(obj);
    this.OutputStreamDirty();
  }

  // The engine calls no function yet, so no newline is dropped at a
  // function's start: a newline is written unless the output already ends in
  // one or holds nothing.
  PushToOutputStreamIndividual(obj: InkObject | null): void {
    if (obj === null) {
      throw new Error("obj");
    }
    if (obj instanceof StringValue && obj.isNewline) {
      if (this.outputStreamEndsInNewline || !this.outputStreamContainsContent) {
        return;
      }
    }
    this.outputStream.push(obj);
    this.OutputStreamDirty();
  }

  TrySplittingHeadTailWhitespace(single: StringValue): StringValue[] | null {
    return splitHeadTailWhitespace(single);
  }

  get outputStreamEndsInNewline(): boolean {
    for (let i = this.outputStream.length - 1; i >= 0; i--) {
      const obj = this.outputStream[i];
      if (obj instanceof ControlCommand) break;
      if (obj instanceof StringValue) {
        if (obj.isNewline) return true;
        else if (obj.isNonWhitespace) break;
      }
    }
    return false;
  }

  get outputStreamContainsContent(): boolean {
    for (const content of this.outputStream) {
      if (content instanceof StringValue || content instanceof ObjectValue) {
        return true;
      }
    }
    return false;
  }

  get inStringEvaluation(): boolean {
    for (let i = this.outputStream.length - 1; i >= 0; i--) {
      const cmd = this.outputStream[i];
      if (
        cmd instanceof ControlCommand &&
        cmd.commandType == ControlCommand.CommandType.BeginString
      ) {
        return true;
      }
    }
    return false;
  }

  /** Ends this continue's output at `outputCut` with the newline the cut line
   *  was waiting for, and carries the output after it to the next continue. */
  CarryOutputPastCut(): void {
    if (this.outputCut === null) return;
    const cut = this.outputCut;
    this.outputCut = null;
    this.carried = {
      output: this.outputStream.splice(cut),
      lineEndPending: this.lineEndPending,
    };
    this.lineEndPending = false;
    this.outputStream.push(new StringValue("\n"));
    this.OutputStreamDirty();
  }

  /** Writes the newline at `outputCut` and keeps the output after it, for a
   *  step that leaves no next continue to carry it to. */
  CloseOutputCut(): void {
    if (this.outputCut === null) return;
    this.outputStream.splice(this.outputCut, 0, new StringValue("\n"));
    this.outputCut = null;
    this.OutputStreamDirty();
  }

  TakeCarriedStep(): CarriedStep | null {
    const carried = this.carried;
    this.carried = null;
    return carried;
  }

  DiscardLineEnd(): void {
    this.lineEndPending = false;
    this.lineJoinable = false;
    this.outputCut = null;
    this.carried = null;
  }

  ForceEnd(): void {
    this.DiscardLineEnd();
    this.position = null;
    this.didSafeExit = true;
  }

  // ------------------------------------------------- what the output reads as

  protected _textDirty = true;
  protected _tagsDirty = true;
  protected _currentText: string | null = null;
  protected _currentTags: string[] = [];

  OutputStreamDirty(): void {
    this._textDirty = true;
    this._tagsDirty = true;
  }

  get currentText(): string | null {
    if (this._textDirty) {
      const sb = new StringBuilder();
      let inTag = false;
      for (const outputObj of this.outputStream) {
        if (!inTag && outputObj instanceof StringValue) {
          sb.Append(outputObj.value);
        } else if (!inTag && outputObj instanceof ObjectValue) {
          const tableText = outputObj.value?.get("text");
          if (tableText instanceof StringValue && tableText.value) {
            sb.Append(tableText.value);
          }
        } else if (outputObj instanceof ControlCommand) {
          if (outputObj.commandType == ControlCommand.CommandType.BeginTag) {
            inTag = true;
          } else if (outputObj.commandType == ControlCommand.CommandType.EndTag) {
            inTag = false;
          }
        }
      }
      this._currentText = this._cleanWhitespace(sb.toString());
      this._textDirty = false;
    }
    return this._currentText;
  }

  get currentTags(): string[] {
    if (this._tagsDirty) {
      this._currentTags = [];
      let inTag = false;
      const sb = new StringBuilder();
      for (const outputObj of this.outputStream) {
        if (outputObj instanceof ControlCommand) {
          if (outputObj.commandType == ControlCommand.CommandType.BeginTag) {
            if (inTag && sb.Length > 0) {
              this._currentTags.push(this._cleanWhitespace(sb.toString()));
              sb.Clear();
            }
            inTag = true;
          } else if (outputObj.commandType == ControlCommand.CommandType.EndTag) {
            if (sb.Length > 0) {
              this._currentTags.push(this._cleanWhitespace(sb.toString()));
              sb.Clear();
            }
            inTag = false;
          }
        } else if (inTag) {
          if (outputObj instanceof StringValue) {
            sb.Append(outputObj.value);
          }
        } else if (
          outputObj instanceof Tag &&
          outputObj.text != null &&
          outputObj.text.length > 0
        ) {
          this._currentTags.push(outputObj.text);
        }
      }
      if (sb.Length > 0) {
        this._currentTags.push(this._cleanWhitespace(sb.toString()));
        sb.Clear();
      }
      this._tagsDirty = false;
    }
    return this._currentTags;
  }

  get currentDisplayInstructions(): ObjectValue[] {
    const result: ObjectValue[] = [];
    let inTag = false;
    for (const outputObj of this.outputStream) {
      if (outputObj instanceof ControlCommand) {
        if (outputObj.commandType == ControlCommand.CommandType.BeginTag) {
          inTag = true;
        } else if (outputObj.commandType == ControlCommand.CommandType.EndTag) {
          inTag = false;
        }
        continue;
      }
      if (!inTag && outputObj instanceof ObjectValue) {
        result.push(outputObj);
      }
    }
    return result;
  }

  // ------------------------------------------------------------------- saving

  // Visits and turns are not counted yet, so a save writes the two maps empty
  // and the checkpoint store's delta readers see no change.
  GetVisitCountEntries(): [string, number][] {
    return [];
  }

  GetTurnIndexEntries(): [string, number][] {
    return [];
  }

  DrainVisitCountDeltas(): [string, number][] {
    return [];
  }

  DrainTurnIndexDeltas(): [string, number][] {
    return [];
  }

  ResetCountDeltaTracking(): void {}

  /** The state as JSON: the position as a chunk id, its entry and offset and
   *  its sequence's id, the output and eval stack, the line end, and the
   *  globals. A position past the last statement of its sequence, where a
   *  flow rests after its last beat, has no chunk: it is written with chunk id
   *  -1 and named by its sequence alone. A position holds within a session,
   *  for as long as a root holds its chunk or, past the last statement, its
   *  sequence. */
  toJson(): string {
    const writer = new SimpleJson.Writer();
    writer.WriteObjectStart();
    writer.WriteProperty("engine", "program");
    writer.WritePropertyStart("position");
    if (this.position) {
      const chunk = this.position.sequence.arrays.chunks[this.position.entry];
      writer.WriteArrayStart();
      writer.WriteInt(chunk ? chunkId(chunk) : -1);
      writer.WriteInt(this.position.entry);
      writer.WriteInt(this.position.offset);
      writer.WriteInt(this.position.sequence.id);
      writer.WriteArrayEnd();
    } else {
      writer.WriteNull();
    }
    writer.WritePropertyEnd();
    writer.WriteProperty("evalStack", (w) =>
      JsonSerialisation.WriteListRuntimeObjs(w, this.evaluationStack),
    );
    writer.WriteProperty("output", (w) =>
      JsonSerialisation.WriteListRuntimeObjs(w, this.outputStream),
    );
    if (this.carried) {
      const carried = this.carried;
      writer.WriteProperty("carried", (w) =>
        JsonSerialisation.WriteListRuntimeObjs(w, carried.output),
      );
      writer.WriteProperty("carriedLineEndPending", carried.lineEndPending);
    }
    writer.WriteProperty("lineEndPending", this.lineEndPending);
    writer.WriteProperty("lineJoinable", this.lineJoinable);
    writer.WriteIntProperty("turnIdx", this.currentTurnIndex);
    writer.WriteIntProperty("storySeed", this.storySeed);
    writer.WriteIntProperty("previousRandom", this.previousRandom);
    writer.WriteProperty("didSafeExit", this.didSafeExit);
    writer.WriteProperty("variablesState", (w) =>
      this.variablesState.WriteJson(w),
    );
    writer.WriteProperty("visitCounts", (w) => {
      w.WriteObjectStart();
      w.WriteObjectEnd();
    });
    writer.WriteProperty("turnIndices", (w) => {
      w.WriteObjectStart();
      w.WriteObjectEnd();
    });
    writer.WriteObjectEnd();
    return writer.toString();
  }

  ToJsonWithoutCounts(): string {
    return this.toJson();
  }

  /** Restores a state `toJson` wrote. The position is placed through the
   *  root, which must still hold the chunk it names, or for a position past
   *  the last statement of its sequence, the sequence; a position in a
   *  statement or flow the program no longer has is refused, since placing
   *  one is the saved form's work (docs/engine/binary-program.md, section 8). */
  LoadJson(json: string): void {
    const obj = SimpleJson.TextToDictionary(json);
    if (obj["engine"] !== "program") {
      throw new Error("The save was not written by the program engine.");
    }
    this._noteChanged();
    // A fresh identity registry for this load, as `StoryState.LoadJsonObj`
    // opens one: a table reference resolves against the tables this load
    // reads, never a previous load's.
    JsonSerialisation.ResetObjectLoadSession();
    const position = obj["position"] as number[] | null;
    if (position) {
      const [id, entry, offset, sequenceId] = position as [
        number,
        number,
        number,
        number,
      ];
      if (id === -1) {
        const sequence = this._root.sequence(sequenceId);
        if (!sequence) {
          throw new Error(
            "The saved position is in a flow this program no longer has.",
          );
        }
        this.position = {
          sequence,
          entry: sequence.arrays.chunks.length,
          offset: 0,
        };
      } else {
        const placed = this._root.position(id, entry);
        if (!placed) {
          throw new Error(
            "The saved position is in a statement this program no longer has.",
          );
        }
        this.position = {
          sequence: placed.sequence,
          entry: placed.entry,
          offset,
        };
      }
    } else {
      this.position = null;
    }
    this.evaluationStack = JsonSerialisation.JArrayToRuntimeObjList(
      obj["evalStack"],
    );
    this.outputStream = JsonSerialisation.JArrayToRuntimeObjList(obj["output"]);
    this.carried = obj["carried"]
      ? {
          output: JsonSerialisation.JArrayToRuntimeObjList(obj["carried"]),
          lineEndPending: obj["carriedLineEndPending"] === true,
        }
      : null;
    this.lineEndPending = obj["lineEndPending"] === true;
    this.lineJoinable = obj["lineJoinable"] === true;
    this.outputCut = null;
    this.currentTurnIndex = obj["turnIdx"];
    this.storySeed = obj["storySeed"];
    this.previousRandom = obj["previousRandom"];
    this.didSafeExit = obj["didSafeExit"] === true;
    this.variablesState.SetJsonToken(obj["variablesState"]);
    // A `new`-instance table saved with its class's name links again to the
    // live class global, now that the globals are loaded.
    JsonSerialisation.RelinkPendingDefineRefs((className) => {
      const value = this.variablesState.GetVariableWithName(className);
      return value instanceof ObjectValue ? value : null;
    });
    this.ResetErrors();
    this.OutputStreamDirty();
  }
}

// Whether pushing `obj` shows something: text that is not only spaces and
// newlines, a display table, or the start of a tag (`StoryState.ts`).
function showsOutput(obj: InkObject | null): boolean {
  if (obj instanceof StringValue) return /[^ \t\n]/.test(obj.value ?? "");
  if (obj instanceof ObjectValue || obj instanceof Tag) return true;
  return (
    obj instanceof ControlCommand &&
    obj.commandType == ControlCommand.CommandType.BeginTag
  );
}
