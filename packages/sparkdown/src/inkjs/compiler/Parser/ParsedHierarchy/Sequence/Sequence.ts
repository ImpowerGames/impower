import { ContentList } from "../ContentList";
import { ParsedObject } from "../Object";
import { SequenceType } from "./SequenceType";
import { Weave } from "../Weave";
import type {
  ProgramEmitter,
  ProgramLabel,
} from "../../../../../program/ProgramEmitter";
import { Op } from "../../../../../program/ProgramInstructions";

export class Sequence extends ParsedObject {
  public sequenceElements: ParsedObject[];

  constructor(
    elementContentLists: ContentList[],
    public readonly sequenceType: SequenceType,
  ) {
    super();

    this.sequenceType = sequenceType;
    this.sequenceElements = [];

    for (const elementContentList of elementContentLists) {
      const contentObjs = elementContentList.content;
      let seqElObject: ParsedObject | null = null;

      // Don't attempt to create a weave for the sequence element
      // if the content list is empty. Weaves don't like it!
      if (contentObjs === null || contentObjs.length === 0) {
        seqElObject = elementContentList;
      } else {
        seqElObject = new Weave(contentObjs);
      }

      this.sequenceElements.push(seqElObject);
      this.AddContent(seqElObject);
    }
  }

  override get typeName(): string {
    return "Sequence";
  }

  // One run of code in the statement's chunk (docs/engine/binary-program.md,
  // section 3): the `Visit` of the alternator's own symbol, which counts it
  // at its start as its container counts, its `VisitIndex`, the clamp
  // (`MIN` for a chain and a queue, `%` for a cycle), the shuffle when it
  // shuffles, and per arm a test of the index and the arm's content inline,
  // as the runtime objects run them.
  public override EmitProgram(emitter: ProgramEmitter): void {
    const symbol = emitter.alternatorSymbol(this);
    const once = (this.sequenceType & SequenceType.Once) > 0;
    const cycle = (this.sequenceType & SequenceType.Cycle) > 0;
    const stopping = (this.sequenceType & SequenceType.Stopping) > 0;
    const shuffle = (this.sequenceType & SequenceType.Shuffle) > 0;
    const elements = this.sequenceElements.length;
    const branches = once ? elements + 1 : elements;
    const native = (name: string) =>
      emitter.emit(Op.Native, emitter.string(name), 2);

    emitter.emit(Op.Visit, symbol);
    emitter.emit(Op.VisitIndex, symbol);
    if (stopping || once) {
      emitter.emit(Op.Int, branches - 1);
      native("MIN");
    } else if (cycle) {
      emitter.emit(Op.Int, elements);
      native("%");
    }
    if (shuffle) {
      let skip: ProgramLabel | null = null;
      if (once || stopping) {
        // The last index is not shuffled.
        emitter.emit(Op.Dup);
        emitter.emit(Op.Int, stopping ? elements - 1 : elements);
        native("==");
        const shuffled = emitter.jump(Op.JumpIfFalse);
        skip = emitter.jump(Op.Jump);
        emitter.bind(shuffled);
      }
      emitter.emit(Op.Int, stopping ? elements - 1 : elements);
      emitter.emit(Op.ShuffleIndex, symbol);
      if (skip) {
        emitter.bind(skip);
      }
    }
    const end: ProgramLabel = { offset: -1 };
    for (let arm = 0; arm < branches; arm += 1) {
      emitter.emit(Op.Dup);
      emitter.emit(Op.Int, arm);
      native("==");
      const next = emitter.jump(Op.JumpIfFalse);
      emitter.emit(Op.Pop);
      if (arm < elements) {
        emitter.emitObject(this.sequenceElements[arm]!);
      }
      emitter.jumpBack(Op.Jump, end);
      emitter.bind(next);
    }
    emitter.bind(end);
  }

  protected override Prepare(): boolean {
    for (const el of this.sequenceElements) {
      el.prepare();
    }
    return true;
  }
}
