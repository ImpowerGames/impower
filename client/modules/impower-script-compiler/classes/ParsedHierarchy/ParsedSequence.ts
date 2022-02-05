import {
  Container,
  ControlCommand,
  Divert,
  IntValue,
  NativeFunctionCall,
  RuntimeObject,
} from "../../../impower-script-engine";
import { IObject } from "../../types/IObject";
import { IStory } from "../../types/IStory";
import { SequenceDivertToResolve } from "../../types/SequenceDivertToResolve";
import { SequenceType } from "../../types/SequenceType";
import { ParsedContentList } from "./ParsedContentList";
import { ParsedObject } from "./ParsedObject";
import { ParsedWeave } from "./ParsedWeave";

export class ParsedSequence extends ParsedObject {
  sequenceElements: IObject[];

  sequenceType: SequenceType;

  private _sequenceDivertsToResove: SequenceDivertToResolve[];

  constructor(
    elementContentLists: ParsedContentList[],
    sequenceType: SequenceType
  ) {
    super();
    this.sequenceType = sequenceType;
    this.sequenceElements = [];

    elementContentLists.forEach((elementContentList) => {
      const contentObjs = elementContentList.content;

      let seqElObject: IObject = null;

      // Don't attempt to create a weave for the sequence element
      // if the content list is empty. Weaves don't like it!
      if (contentObjs == null || contentObjs.length === 0) {
        seqElObject = elementContentList;
      } else {
        seqElObject = new ParsedWeave(contentObjs);
      }

      this.sequenceElements.push(seqElObject);
      this.AddContent(seqElObject);
    });
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
  override GenerateRuntimeObject(): RuntimeObject {
    const container = new Container();
    container.visitsShouldBeCounted = true;
    container.countingAtStartOnly = true;

    this._sequenceDivertsToResove = [];

    // Get sequence read count
    container.AddContent(ControlCommand.EvalStart());
    container.AddContent(ControlCommand.VisitIndex());

    const once = (this.sequenceType & SequenceType.Once) > 0;
    const cycle = (this.sequenceType & SequenceType.Cycle) > 0;
    const stopping = (this.sequenceType & SequenceType.Stopping) > 0;
    const shuffle = (this.sequenceType & SequenceType.Shuffle) > 0;

    let seqBranchCount = this.sequenceElements.length;
    if (once) {
      seqBranchCount += 1;
    }

    // Chosen sequence index:
    //  - Stopping: take the MIN(read count, num elements - 1)
    //  - Once: take the MIN(read count, num elements)
    //    (the last one being empty)
    if (stopping || once) {
      // var limit = stopping ? seqBranchCount-1 : seqBranchCount;
      container.AddContent(new IntValue(seqBranchCount - 1));
      container.AddContent(NativeFunctionCall.CallWithName("MIN"));
    }

    // - Cycle: take (read count % num elements)
    else if (cycle) {
      container.AddContent(new IntValue(this.sequenceElements.length));
      container.AddContent(NativeFunctionCall.CallWithName("%"));
    }

    // Shuffle
    if (shuffle) {
      // Create point to return to when sequence is complete
      const postShuffleNoOp = ControlCommand.NoOp();

      // When visitIndex == lastIdx, we skip the shuffle
      if (once || stopping) {
        // if( visitIndex == lastIdx ) -> skipShuffle
        const lastIdx = stopping
          ? this.sequenceElements.length - 1
          : this.sequenceElements.length;
        container.AddContent(ControlCommand.Duplicate());
        container.AddContent(new IntValue(lastIdx));
        container.AddContent(NativeFunctionCall.CallWithName("=="));

        const skipShuffleDivert = new Divert();
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
      container.AddContent(ControlCommand.SequenceShuffleIndex());
      if (once || stopping) {
        container.AddContent(postShuffleNoOp);
      }
    }

    container.AddContent(ControlCommand.EvalEnd());

    // Create point to return to when sequence is complete
    const postSequenceNoOp = ControlCommand.NoOp();

    // Each of the main sequence branches, and one extra empty branch if
    // we have a "once" sequence.
    for (let elIndex = 0; elIndex < seqBranchCount; elIndex += 1) {
      // This sequence element:
      //  if( chosenIndex == this index ) divert to this sequence element
      // duplicate chosen sequence index, since it'll be consumed by "=="
      container.AddContent(ControlCommand.EvalStart());
      container.AddContent(ControlCommand.Duplicate());
      container.AddContent(new IntValue(elIndex));
      container.AddContent(NativeFunctionCall.CallWithName("=="));
      container.AddContent(ControlCommand.EvalEnd());

      // Divert branch for this sequence element
      const sequenceDivert = new Divert();
      sequenceDivert.isConditional = true;
      container.AddContent(sequenceDivert);

      let contentContainerForSequenceBranch: Container;

      // Generate content for this sequence element
      if (elIndex < this.sequenceElements.length) {
        const el = this.sequenceElements[elIndex];
        contentContainerForSequenceBranch = el.runtimeObject as Container;
      }

      // Final empty branch for "once" sequences
      else {
        contentContainerForSequenceBranch = new Container();
      }

      contentContainerForSequenceBranch.name = `s${elIndex}`;
      contentContainerForSequenceBranch.InsertContent(
        ControlCommand.PopEvaluatedValue(),
        0
      );

      // When sequence element is complete, divert back to end of sequence
      const seqBranchCompleteDivert = new Divert();
      contentContainerForSequenceBranch.AddContent(seqBranchCompleteDivert);
      container.AddToNamedContentOnly(contentContainerForSequenceBranch);

      // Save the diverts for reference resolution later (in ResolveReferences)
      this.AddDivertToResolve(
        sequenceDivert,
        contentContainerForSequenceBranch
      );
      this.AddDivertToResolve(seqBranchCompleteDivert, postSequenceNoOp);
    }

    container.AddContent(postSequenceNoOp);

    return container;
  }

  private AddDivertToResolve(
    divert: Divert,
    targetContent: RuntimeObject
  ): void {
    this._sequenceDivertsToResove.push({
      divert,
      targetContent,
    });
  }

  override ResolveReferences(context: IStory): void {
    super.ResolveReferences(context);

    this._sequenceDivertsToResove.forEach((toResolve) => {
      toResolve.divert.targetPath = toResolve.targetContent.path;
    });
  }
}
