// Used by the FlowBase when constructing the weave flow from

import {
  Container,
  Divert,
  RuntimeObject,
} from "../../../impower-script-engine";
import { BadTerminationHandler } from "../../types/BadTerminationHandler";
import { GatherPointToResolve } from "../../types/GatherPointToResolve";
import { isChoice } from "../../types/IChoice";
import { isConstantDeclaration } from "../../types/IConstantDeclaration";
import { isDivert } from "../../types/IDivert";
import { IFlowBase, isFlowBase } from "../../types/IFlowBase";
import { IObject } from "../../types/IObject";
import { IStory } from "../../types/IStory";
import { isText } from "../../types/IText";
import { isVariableAssignment } from "../../types/IVariableAssignment";
import { isWeave, IWeave } from "../../types/IWeave";
import { isWeavePoint, IWeavePoint } from "../../types/IWeavePoint";
import { ParsedAuthorWarning } from "./ParsedAuthorWarning";
import { ParsedChoice } from "./ParsedChoice";
import { ParsedConditional } from "./ParsedConditional";
import { ParsedDivert } from "./ParsedDivert";
import { ParsedDivertTarget } from "./ParsedDivertTarget";
import { ParsedGather } from "./ParsedGather";
import { ParsedObject } from "./ParsedObject";
import { ParsedSequence } from "./ParsedSequence";
import { ParsedTunnelOnwards } from "./ParsedTunnelOnwards";

// a flat list of content objects.
export class ParsedWeave extends ParsedObject implements IWeave {
  // Containers can be chained as multiple gather points
  // get created as the same indentation level.
  // rootContainer is always the first in the chain, while
  // currentContainer is the latest.
  get rootContainer(): Container {
    if (this._rootContainer == null) {
      this.GenerateRuntimeObject();
    }

    return this._rootContainer;
  }

  baseIndentIndex = 0;

  // Loose ends are:
  //  - Choices or Gathers that need to be joined up
  //  - Explicit Divert to gather points (i.e. "->" without a target)
  looseEnds: IWeavePoint[] = null;

  gatherPointsToResolve: GatherPointToResolve[] = null;

  private currentContainer: Container = null;

  // Keep track of previous weave point (Choice or Gather)
  // at the current indentation level:
  //  - to add ordinary content to be nested under it
  //  - to add nested content under it when it's indented
  //  - to remove it from the list of loose ends when
  //     - it has indented content since it's no longer a loose end
  //     - it's a gather and it has a choice added to it
  private previousWeavePoint: IWeavePoint = null;

  private addContentToPreviousWeavePoint = false;

  // Used for determining whether the next Gather should auto-enter
  private hasSeenChoiceInSection = false;

  private _unnamedGatherCount = 0;

  private _choiceCount = 0;

  private _rootContainer: Container = null;

  private _namedWeavePoints: Record<string, IWeavePoint> = null;

  get lastParsedSignificantObject(): ParsedObject {
    if (!this.content || this.content.length === 0) {
      return null;
    }

    // Don't count extraneous newlines or VAR/CONST declarations,
    // since they're "empty" statements outside of the main flow.
    let lastObject: IObject = null;
    for (let i = this.content.length - 1; i >= 0; i -= 1) {
      lastObject = this.content[i];

      const lastText = lastObject;
      if (
        !isText(lastText) ||
        lastText.text !== "\n" ||
        !this.IsGlobalDeclaration(lastObject)
      ) {
        break;
      }
    }

    const lastWeave = lastObject;
    if (isWeave(lastWeave)) {
      lastObject = lastWeave.lastParsedSignificantObject;
    }

    return lastObject as ParsedObject;
  }

  constructor(cont: IObject[], indentIndex = -1) {
    super();
    if (indentIndex === -1) {
      this.baseIndentIndex = this.DetermineBaseIndentationFromContent(cont);
    } else {
      this.baseIndentIndex = indentIndex;
    }

    this.AddContent(cont);

    this.ConstructWeaveHierarchyFromIndentation();
  }

  ResolveWeavePointNaming(): void {
    const namedWeavePoints = this.FindAll<IWeavePoint>(
      (w) => isWeavePoint(w) && Boolean(w.name)
    );

    this._namedWeavePoints = {};

    Object.values(namedWeavePoints).forEach((weavePoint) => {
      // Check for weave point naming collisions
      const existingWeavePoint = this._namedWeavePoints[weavePoint.name];
      if (existingWeavePoint !== undefined) {
        const typeName =
          existingWeavePoint instanceof ParsedGather ? "gather" : "choice";
        const existingObj = existingWeavePoint;

        this.Error(
          `A ${typeName} with the same label name '${weavePoint.name}' already exists in this context on line ${existingObj.debugMetadata.startLineNumber}`,
          weavePoint
        );
      }

      this._namedWeavePoints[weavePoint.name] = weavePoint;
    });
  }

  private ConstructWeaveHierarchyFromIndentation(): void {
    // Find nested indentation and convert to a proper object hierarchy
    // (i.e. indented content is replaced with a Weave object that contains
    // that nested content)
    let contentIdx = 0;
    while (contentIdx < this.content.length) {
      const obj = this.content[contentIdx];

      // Choice or Gather
      if (isWeavePoint(obj)) {
        const weavePoint = obj;
        const weaveIndentIdx = weavePoint.indentationDepth - 1;

        // Inner level indentation - recurse
        if (weaveIndentIdx > this.baseIndentIndex) {
          // Step through content until indent jumps out again
          const innerWeaveStartIdx = contentIdx;
          while (contentIdx < this.content.length) {
            const innerWeaveObj = this.content[contentIdx];
            if (isWeavePoint(innerWeaveObj)) {
              const innerIndentIdx = innerWeaveObj.indentationDepth - 1;
              if (innerIndentIdx <= this.baseIndentIndex) {
                break;
              }
            }

            contentIdx += 1;
          }

          const weaveContentCount = contentIdx - innerWeaveStartIdx;

          const weaveContent = this.content.slice(
            innerWeaveStartIdx,
            contentIdx
          );
          this.content.splice(innerWeaveStartIdx, weaveContentCount);

          const weave = new ParsedWeave(weaveContent, weaveIndentIdx);
          this.InsertContent(innerWeaveStartIdx, weave);

          // Continue iteration from this point
          contentIdx = innerWeaveStartIdx;
        }
      }

      contentIdx += 1;
    }
  }

  // When the indentation wasn't told to us at construction time using
  // a choice point with a known indentation level, we may be told to
  // determine the indentation level by incrementing from our closest ancestor.
  DetermineBaseIndentationFromContent(contentList: IObject[]): number {
    for (let i = 0; i < contentList.length; i += 1) {
      const obj = contentList[i];
      if (isWeavePoint(obj)) {
        return obj.indentationDepth - 1;
      }
    }

    // No weave points, so it doesn't matter
    return 0;
  }

  override GenerateRuntimeObject(): RuntimeObject {
    this._rootContainer = new Container();
    this.currentContainer = this._rootContainer;
    this.looseEnds = [];

    this.gatherPointsToResolve = [];

    // Iterate through content for the block at this level of indentation
    //  - Normal content is nested under Choices and Gathers
    //  - Blocks that are further indented cause recursion
    //  - Keep track of loose ends so that they can be diverted to Gathers
    this.content.forEach((obj) => {
      // Choice or Gather
      if (isWeavePoint(obj)) {
        this.AddRuntimeForWeavePoint(obj);
      }
      // Nested weave
      else if (isWeave(obj)) {
        const weave = obj;
        this.AddRuntimeForNestedWeave(obj as ParsedWeave);
        this.gatherPointsToResolve.push(...weave.gatherPointsToResolve);
      }
      // Other object
      // May be complex object that contains statements - e.g. a multi-line conditional
      else {
        this.AddGeneralRuntimeContent(obj.runtimeObject);
      }
    });

    // Pass any loose ends up the hierarhcy
    this.PassLooseEndsToAncestors();

    return this._rootContainer;
  }

  // Found gather point:
  //  - gather any loose ends
  //  - set the gather as the main container to dump new content in
  private AddRuntimeForGather(gather: ParsedGather): void {
    // Determine whether this Gather should be auto-entered:
    //  - It is auto-entered if there were no choices in the last section
    //  - A section is "since the previous gather" - so reset now
    const autoEnter = !this.hasSeenChoiceInSection;
    this.hasSeenChoiceInSection = false;

    const gatherContainer = gather.runtimeContainer;

    if (gather.name == null) {
      // Use disallowed character so it's impossible to have a name collision
      gatherContainer.name = `g-${this._unnamedGatherCount}`;
      this._unnamedGatherCount += 1;
    }

    // Auto-enter: include in main content
    if (autoEnter) {
      this.currentContainer.AddContent(gatherContainer);
    }

    // Don't auto-enter:
    // Add this gather to the main content, but only accessible
    // by name so that it isn't stepped into automatically, but only via
    // a divert from a loose end.
    else {
      this._rootContainer.AddToNamedContentOnly(gatherContainer);
    }

    // Consume loose ends: divert them to this gather
    this.looseEnds.forEach((looseEndWeavePoint) => {
      const looseEnd = looseEndWeavePoint;

      // Skip gather loose ends that are at the same level
      // since they'll be handled by the auto-enter code below
      // that only jumps into the gather if (current runtime choices == 0)
      if (
        !(looseEnd instanceof ParsedGather) ||
        looseEnd.indentationDepth !== gather.indentationDepth
      ) {
        let divert: Divert = null;

        if (looseEnd instanceof ParsedDivert) {
          divert = looseEnd.runtimeObject as Divert;
        } else {
          divert = new Divert();
          looseEnd.runtimeContainer.AddContent(divert);
        }

        // Pass back knowledge of this loose end being diverted
        // to the FlowBase so that it can maintain a list of them,
        // and resolve the divert references later
        this.gatherPointsToResolve.push({
          divert,
          targetRuntimeObj: gatherContainer,
        });
      }
    });
    this.looseEnds.length = 0;

    // Replace the current container itself
    this.currentContainer = gatherContainer;
  }

  private AddRuntimeForWeavePoint(weavePoint: IWeavePoint): void {
    // Current level Gather
    if (weavePoint instanceof ParsedGather) {
      this.AddRuntimeForGather(weavePoint);
    }

    // Current level choice
    else if (weavePoint instanceof ParsedChoice) {
      // Gathers that contain choices are no longer loose ends
      // (same as when weave points get nested content)
      if (this.previousWeavePoint instanceof ParsedGather) {
        const previousIndex = this.looseEnds.indexOf(this.previousWeavePoint);
        if (previousIndex >= 0) {
          this.looseEnds.splice(previousIndex, 1);
        }
      }

      // Add choice point content
      const choice = weavePoint as ParsedChoice;
      this.currentContainer.AddContent(choice.runtimeObject);

      // Add choice's inner content to self
      choice.innerContentContainer.name = `c-${this._choiceCount}`;
      this.currentContainer.AddToNamedContentOnly(choice.innerContentContainer);
      this._choiceCount += 1;

      this.hasSeenChoiceInSection = true;
    }

    // Keep track of loose ends
    this.addContentToPreviousWeavePoint = false; // default
    if (this.WeavePointHasLooseEnd(weavePoint)) {
      this.looseEnds.push(weavePoint);

      const looseChoice = weavePoint;
      if (isChoice(looseChoice)) {
        this.addContentToPreviousWeavePoint = true;
      }
    }
    this.previousWeavePoint = weavePoint;
  }

  // Add nested block at a greater indentation level
  AddRuntimeForNestedWeave(nestedResult: ParsedWeave): void {
    // Add this inner block to current container
    // (i.e. within the main container, or within the last defined Choice/Gather)
    this.AddGeneralRuntimeContent(nestedResult.rootContainer);

    // Now there's a deeper indentation level, the previous weave point doesn't
    // count as a loose end (since it will have content to go to)
    if (this.previousWeavePoint != null) {
      const previousIndex = this.looseEnds.indexOf(this.previousWeavePoint);
      if (previousIndex >= 0) {
        this.looseEnds.splice(previousIndex, 1);
      }
      this.addContentToPreviousWeavePoint = false;
    }
  }

  // Normal content gets added into the latest Choice or Gather by default,
  // unless there hasn't been one yet.
  private AddGeneralRuntimeContent(content: RuntimeObject): void {
    // Content is allowed to evaluate runtimeObject to null
    // (e.g. AuthorWarning, which doesn't make it into the runtime)
    if (content == null) {
      return;
    }

    if (this.addContentToPreviousWeavePoint) {
      this.previousWeavePoint.runtimeContainer.AddContent(content);
    } else {
      this.currentContainer.AddContent(content);
    }
  }

  private PassLooseEndsToAncestors(): void {
    if (!this.looseEnds || this.looseEnds.length === 0) {
      return;
    }

    // Search for Weave ancestor to pass loose ends to for gathering.
    // There are two types depending on whether the current weave
    // is separated by a conditional or sequence.
    //  - An "inner" weave is one that is directly connected to the current
    //    weave - i.e. you don't have to pass through a conditional or
    //    sequence to get to it. We're allowed to pass all loose ends to
    //    one of these.
    //  - An "outer" weave is one that is outside of a conditional/sequence
    //    that the current weave is nested within. We're only allowed to
    //    pass gathers (i.e. 'normal flow') loose ends up there, not normal
    //    choices. The rule is that choices have to be diverted explicitly
    //    by the author since it's ambiguous where flow should go otherwise.
    //
    // e.g.:
    //
    //   - top                       <- e.g. outer weave
    //   {true:
    //       * choice                <- e.g. inner weave
    //         * * choice 2
    //             more content      <- e.g. current weave
    //       * choice 2
    //   }
    //   - more of outer weave
    //
    let closestInnerWeaveAncestor: ParsedWeave = null;
    let closestOuterWeaveAncestor: ParsedWeave = null;

    // Find inner and outer ancestor weaves as defined above.
    let nested = false;
    for (
      let ancestor = this.parent;
      ancestor != null;
      ancestor = ancestor.parent
    ) {
      // Found ancestor?
      const weaveAncestor = ancestor;
      if (isWeave(weaveAncestor)) {
        if (!nested && closestInnerWeaveAncestor == null) {
          closestInnerWeaveAncestor = weaveAncestor as ParsedWeave;
        }

        if (nested && closestOuterWeaveAncestor == null) {
          closestOuterWeaveAncestor = weaveAncestor as ParsedWeave;
        }
      }

      // Weaves nested within Sequences or Conditionals are
      // "sealed" - any loose ends require explicit diverts.
      if (
        ancestor instanceof ParsedSequence ||
        ancestor instanceof ParsedConditional
      ) {
        nested = true;
      }
    }

    // No weave to pass loose ends to at all?
    if (
      closestInnerWeaveAncestor == null &&
      closestOuterWeaveAncestor == null
    ) {
      return;
    }

    // Follow loose end passing logic as defined above
    for (let i = this.looseEnds.length - 1; i >= 0; i -= 1) {
      const looseEnd = this.looseEnds[i];

      let received = false;

      // This weave is nested within a conditional or sequence:
      //  - choices can only be passed up to direct ancestor ("inner") weaves
      //  - gathers can be passed up to either, but favour the closer (inner) weave
      //    if there is one
      if (nested) {
        if (
          looseEnd instanceof ParsedChoice &&
          closestInnerWeaveAncestor != null
        ) {
          closestInnerWeaveAncestor.ReceiveLooseEnd(looseEnd);
          received = true;
        } else if (!(looseEnd instanceof ParsedChoice)) {
          const receivingWeave =
            closestInnerWeaveAncestor ?? closestOuterWeaveAncestor;
          if (receivingWeave != null) {
            receivingWeave.ReceiveLooseEnd(looseEnd);
            received = true;
          }
        }
      }

      // No nesting, all loose ends can be safely passed up
      else {
        closestInnerWeaveAncestor.ReceiveLooseEnd(looseEnd);
        received = true;
      }

      if (received) {
        this.looseEnds.splice(i, 1);
      }
    }
  }

  private ReceiveLooseEnd(childWeaveLooseEnd: IWeavePoint): void {
    this.looseEnds.push(childWeaveLooseEnd);
  }

  override ResolveReferences(context: IStory): void {
    super.ResolveReferences(context);

    // Check that choices nested within conditionals and sequences are terminated
    if (this.looseEnds != null && this.looseEnds.length > 0) {
      let isNestedWeave = false;
      for (
        let ancestor = this.parent;
        ancestor != null;
        ancestor = ancestor.parent
      ) {
        if (
          ancestor instanceof ParsedSequence ||
          ancestor instanceof ParsedConditional
        ) {
          isNestedWeave = true;
          break;
        }
      }
      if (isNestedWeave) {
        this.ValidateTermination(this.BadNestedTerminationHandler);
      }
    }

    this.gatherPointsToResolve.forEach((gatherPoint) => {
      gatherPoint.divert.targetPath = gatherPoint.targetRuntimeObj.path;
    });

    this.CheckForWeavePointNamingCollisions();
  }

  WeavePointNamed(name: string): IWeavePoint {
    if (this._namedWeavePoints == null) {
      return null;
    }

    const weavePointResult = this._namedWeavePoints[name];
    if (weavePointResult !== undefined) {
      return weavePointResult;
    }

    return null;
  }

  // Global VARs and CONSTs are treated as "outside of the flow"
  // when iterating over content that follows loose ends
  private IsGlobalDeclaration(obj: IObject): boolean {
    const varAss = obj;
    if (
      isVariableAssignment(varAss) &&
      varAss.isGlobalDeclaration &&
      varAss.isDeclaration
    ) {
      return true;
    }

    const constDecl = obj;
    if (isConstantDeclaration(constDecl)) {
      return true;
    }

    return false;
  }

  // While analysing final loose ends, we look to see whether there
  // are any diverts etc which choices etc divert from
  private ContentThatFollowsWeavePoint(weavePoint: IWeavePoint): IObject[] {
    const obj = weavePoint;

    const result: IObject[] = [];

    // Inner content first (e.g. for a choice)
    if (obj.content != null) {
      for (let i = 0; i < obj.content.length; i += 1) {
        const contentObj = obj.content[i];
        // Global VARs and CONSTs are treated as "outside of the flow"
        if (!this.IsGlobalDeclaration(contentObj)) {
          result.push(contentObj);
        }
      }
    }

    const parentWeave = obj.parent;
    if (!isWeave(parentWeave)) {
      throw new Error("Expected weave point parent to be weave?");
    }

    const weavePointIdx = parentWeave.content.indexOf(obj);

    for (let i = weavePointIdx + 1; i < parentWeave.content.length; i += 1) {
      const laterObj = parentWeave.content[i];

      // Global VARs and CONSTs are treated as "outside of the flow"
      if (!this.IsGlobalDeclaration(laterObj)) {
        // End of the current flow
        if (isWeavePoint(laterObj)) {
          break;
        }

        // Other weaves will be have their own loose ends
        if (isWeave(laterObj)) {
          break;
        }

        result.push(laterObj);
      }
    }

    return result;
  }

  ValidateTermination(badTerminationHandler: BadTerminationHandler): void {
    // Don't worry if the last object in the flow is a "TODO",
    // even if there are other loose ends in other places
    if (this.lastParsedSignificantObject instanceof ParsedAuthorWarning) {
      return;
    }

    // By now, any sub-weaves will have passed loose ends up to the root weave (this).
    // So there are 2 possible situations:
    //  - There are loose ends from somewhere in the flow.
    //    These aren't necessarily "real" loose ends - they're weave points
    //    that don't connect to any lower weave points, so we just
    //    have to check that they terminate properly.
    //  - This weave is just a list of content with no actual weave points,
    //    so we just need to check that the list of content terminates.

    const hasLooseEnds = this.looseEnds != null && this.looseEnds.length > 0;

    if (hasLooseEnds) {
      this.looseEnds.forEach((looseEnd) => {
        const looseEndFlow = this.ContentThatFollowsWeavePoint(looseEnd);
        this.ValidateFlowOfObjectsTerminates(
          looseEndFlow,
          looseEnd,
          badTerminationHandler
        );
      });
    }

    // No loose ends... is there any inner weaving at all?
    // If not, make sure the single content stream is terminated correctly
    else {
      // If there's any actual weaving, assume that content is
      // terminated correctly since we would've had a loose end otherwise
      for (let i = 0; i < this.content.length; i += 1) {
        const obj = this.content[i];
        if (isWeavePoint(obj)) {
          return;
        }
      }

      // Straight linear flow? Check it terminates
      this.ValidateFlowOfObjectsTerminates(
        this.content,
        this,
        badTerminationHandler
      );
    }
  }

  private BadNestedTerminationHandler(terminatingObj: IObject): void {
    let conditional: ParsedConditional = null;
    for (
      let ancestor = terminatingObj.parent;
      ancestor != null;
      ancestor = ancestor.parent
    ) {
      if (
        ancestor instanceof ParsedSequence ||
        ancestor instanceof ParsedConditional
      ) {
        conditional = ancestor as ParsedConditional;
        break;
      }
    }

    let errorMsg =
      "Choices nested in conditionals or sequences need to explicitly divert afterwards.";

    // Tutorialise proper choice syntax if this looks like a single choice within a condition, e.g.
    // { condition:
    //      * choice
    // }
    if (conditional != null) {
      const numChoices = conditional.FindAll<ParsedChoice>(
        (d) => d instanceof ParsedChoice
      ).length;
      if (numChoices === 1) {
        errorMsg = `Choices with conditions should be written: '* {condition} choice'. Otherwise, ${errorMsg.toLowerCase()}`;
      }
    }

    this.Error(errorMsg, terminatingObj);
  }

  private ValidateFlowOfObjectsTerminates(
    objFlow: IObject[],
    defaultObj: IObject,
    badTerminationHandler: BadTerminationHandler
  ): void {
    let terminated = false;
    let terminatingObj = defaultObj;
    for (let i = 0; i < objFlow.length; i += 1) {
      const flowObj = objFlow[i];
      const divert = flowObj.Find<ParsedDivert>(
        (d) =>
          isDivert(d) &&
          !d.isThread &&
          !d.isTunnel &&
          !d.isFunctionCall &&
          !(d.parent instanceof ParsedDivertTarget)
      );
      if (divert != null) {
        terminated = true;
      }

      if (
        flowObj.Find<ParsedTunnelOnwards>(
          (d) => d instanceof ParsedTunnelOnwards
        ) != null
      ) {
        terminated = true;
        break;
      }

      terminatingObj = flowObj;
    }

    if (!terminated) {
      // Author has left a note to self here - clearly we don't need
      // to leave them with another warning since they know what they're doing.
      if (terminatingObj instanceof ParsedAuthorWarning) {
        return;
      }

      badTerminationHandler(terminatingObj);
    }
  }

  private WeavePointHasLooseEnd(weavePoint: IWeavePoint): boolean {
    // No content, must be a loose end.
    if (weavePoint.content == null) {
      return true;
    }

    // If a weave point is diverted from, it doesn't have a loose end.
    // Detect a divert object within a weavePoint's main content
    // Work backwards since we're really interested in the end,
    // although it doesn't actually make a difference!
    // (content after a divert will simply be inaccessible)
    for (let i = weavePoint.content.length - 1; i >= 0; i -= 1) {
      const innerDivert = weavePoint.content[i];
      if (isDivert(innerDivert)) {
        const willReturn =
          innerDivert.isThread ||
          innerDivert.isTunnel ||
          innerDivert.isFunctionCall;
        if (!willReturn) {
          return false;
        }
      }
    }

    return true;
  }

  // Enforce rule that weave points must not have the same
  // name as any stitches or knots upwards in the hierarchy
  private CheckForWeavePointNamingCollisions(): void {
    if (this._namedWeavePoints == null) {
      return;
    }

    const ancestorFlows: IFlowBase[] = [];
    for (let i = 0; i < this.ancestry.length; i += 1) {
      const obj = this.ancestry[i];
      if (isFlowBase(obj)) {
        ancestorFlows.push(obj);
      } else {
        break;
      }
    }

    Object.entries(this._namedWeavePoints).forEach(
      ([weavePointName, weavePoint]) => {
        ancestorFlows.forEach((flow) => {
          // Shallow search
          const otherContentWithName =
            flow.ContentWithNameAtLevel(weavePointName);

          if (otherContentWithName && otherContentWithName !== weavePoint) {
            const errorMsg = `WeavePoint '${weavePointName}' has the same label name as a Content (on ${otherContentWithName.debugMetadata})`;
            this.Error(errorMsg, weavePoint);
          }
        });
      }
    );
  }
}
