import { ContentList } from "../ContentList";
import { Container as RuntimeContainer } from "../../../../engine/Container";
import { ControlCommand as RuntimeControlCommand } from "../../../../engine/ControlCommand";
import { Divert as RuntimeDivert } from "../../../../engine/Divert";
import { IntValue } from "../../../../engine/Value";
import { NativeFunctionCall } from "../../../../engine/NativeFunctionCall";
import { ParsedObject } from "../Object";
import { InkObject as RuntimeObject } from "../../../../engine/Object";
import { SequenceDivertToResolve } from "./SequenceDivertToResolve";
import { SequenceType } from "./SequenceType";
import { Story } from "../Story";
import { Weave } from "../Weave";
import type {
  ProgramEmitter,
  ProgramLabel,
} from "../../../../../program/ProgramEmitter";
import { Op } from "../../../../../program/ProgramInstructions";

export class Sequence extends ParsedObject {
  private _sequenceDivertsToResolve: SequenceDivertToResolve[] = [];

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

  // Generate runtime code that looks like:
  //
  //   chosenIndex = MIN(sequence counter, num elements) e.g. for "Stopping"
  //   if chosenIndex == 0, divert to s0
  //   if chosenIndex == 1, divert to s1  [etc]
  //
  //   - s0:
  //      <content for sequence element>
  //      divert to no-op
  //   - s1:
  //      <content for sequence element>
  //      divert to no-op
  //   - s2:
  //      empty branch if using "once"
  //      divert to no-op
  //
  //    no-op
  //
  public readonly GenerateRuntimeObject = (): RuntimeObject => {
    const container = new RuntimeContainer();
    container.visitsShouldBeCounted = true;
    container.countingAtStartOnly = true;

    this._sequenceDivertsToResolve = [];

    // Get sequence read count
    container.AddContent(RuntimeControlCommand.EvalStart());
    container.AddContent(RuntimeControlCommand.VisitIndex());

    const once: boolean = (this.sequenceType & SequenceType.Once) > 0;
    const cycle: boolean = (this.sequenceType & SequenceType.Cycle) > 0;
    const stopping: boolean = (this.sequenceType & SequenceType.Stopping) > 0;
    const shuffle: boolean = (this.sequenceType & SequenceType.Shuffle) > 0;

    let seqBranchCount = this.sequenceElements.length;
    if (once) {
      seqBranchCount += 1;
    }

    // Chosen sequence index:
    //  - Stopping: take the MIN(read count, num elements - 1)
    //  - Once: take the MIN(read count, num elements)
    //    (the last one being empty)
    if (stopping || once) {
      //var limit = stopping ? seqBranchCount-1 : seqBranchCount;
      container.AddContent(new IntValue(seqBranchCount - 1));
      container.AddContent(NativeFunctionCall.CallWithName("MIN"));
    } else if (cycle) {
      // - Cycle: take (read count % num elements)
      container.AddContent(new IntValue(this.sequenceElements.length));
      container.AddContent(NativeFunctionCall.CallWithName("%"));
    }

    // Shuffle
    if (shuffle) {
      // Create point to return to when sequence is complete
      const postShuffleNoOp = RuntimeControlCommand.NoOp();

      // When visitIndex == lastIdx, we skip the shuffle
      if (once || stopping) {
        // if( visitIndex == lastIdx ) -> skipShuffle
        const lastIdx = stopping
          ? this.sequenceElements.length - 1
          : this.sequenceElements.length;

        container.AddContent(RuntimeControlCommand.Duplicate());
        container.AddContent(new IntValue(lastIdx));
        container.AddContent(NativeFunctionCall.CallWithName("=="));

        const skipShuffleDivert = new RuntimeDivert();
        skipShuffleDivert.isConditional = true;
        container.AddContent(skipShuffleDivert);

        this.AddDivertToResolve(skipShuffleDivert, postShuffleNoOp);
      }

      // This one's a bit more complex! Choose the index at runtime.
      let elementCountToShuffle = this.sequenceElements.length;
      if (stopping) {
        elementCountToShuffle -= 1;
      }

      container.AddContent(new IntValue(elementCountToShuffle));
      container.AddContent(RuntimeControlCommand.SequenceShuffleIndex());
      if (once || stopping) {
        container.AddContent(postShuffleNoOp);
      }
    }

    container.AddContent(RuntimeControlCommand.EvalEnd());

    // Create point to return to when sequence is complete
    const postSequenceNoOp = RuntimeControlCommand.NoOp();

    // Each of the main sequence branches, and one extra empty branch if
    // we have a "once" sequence.
    for (let elIndex = 0; elIndex < seqBranchCount; elIndex += 1) {
      // This sequence element:
      //  if( chosenIndex == this index ) divert to this sequence element
      // duplicate chosen sequence index, since it'll be consumed by "=="
      container.AddContent(RuntimeControlCommand.EvalStart());
      container.AddContent(RuntimeControlCommand.Duplicate());
      container.AddContent(new IntValue(elIndex));
      container.AddContent(NativeFunctionCall.CallWithName("=="));
      container.AddContent(RuntimeControlCommand.EvalEnd());

      // Divert branch for this sequence element
      const sequenceDivert = new RuntimeDivert();
      sequenceDivert.isConditional = true;
      container.AddContent(sequenceDivert);

      let contentContainerForSequenceBranch: RuntimeContainer;

      // Generate content for this sequence element
      if (elIndex < this.sequenceElements.length) {
        const el = this.sequenceElements[elIndex];
        contentContainerForSequenceBranch =
          el!.runtimeObject as RuntimeContainer;
      } else {
        // Final empty branch for "once" sequences
        contentContainerForSequenceBranch = new RuntimeContainer();
      }

      contentContainerForSequenceBranch.name = `s-${elIndex}`;
      contentContainerForSequenceBranch.InsertContent(
        RuntimeControlCommand.PopEvaluatedValue(),
        0,
      );

      // When sequence element is complete, divert back to end of sequence
      const seqBranchCompleteDivert = new RuntimeDivert();
      contentContainerForSequenceBranch.AddContent(seqBranchCompleteDivert);
      container.AddToNamedContentOnly(contentContainerForSequenceBranch);

      // Save the diverts for reference resolution later (in ResolveReferences)
      this.AddDivertToResolve(
        sequenceDivert,
        contentContainerForSequenceBranch,
      );
      this.AddDivertToResolve(seqBranchCompleteDivert, postSequenceNoOp);
    }

    container.AddContent(postSequenceNoOp);

    return container;
  };

  public readonly AddDivertToResolve = (
    divert: RuntimeDivert,
    targetContent: RuntimeObject,
  ) => {
    this._sequenceDivertsToResolve.push(
      new SequenceDivertToResolve(divert, targetContent),
    );
  };

  public override ResolveWith(context: Story, program: boolean): void {
    super.ResolveWith(context, program);

    if (!program) {
      for (const toResolve of this._sequenceDivertsToResolve) {
        toResolve.divert.targetPath = toResolve.targetContent.path;
      }
    }
  }
}
