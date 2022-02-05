import { FlowLevel } from "../../types/FlowLevel";
import { Identifier } from "../../types/Identifier";
import { isFlowBase } from "../../types/IFlowBase";
import { IObject } from "../../types/IObject";
import { IPath } from "../../types/IPath";
import { isWeave } from "../../types/IWeave";

export class ParsedPath implements IPath {
  components: Identifier[] = null;

  private _baseTargetLevel?: FlowLevel = null;

  private _dotSeparatedComponents: string = null;

  get baseTargetLevel(): FlowLevel {
    if (this.baseLevelIsAmbiguous) {
      return FlowLevel.Story;
    }
    return this._baseTargetLevel;
  }

  get baseLevelIsAmbiguous(): boolean {
    return this._baseTargetLevel == null;
  }

  get firstComponent(): string {
    if (this.components == null || this.components.length === 0) {
      return null;
    }

    return this.components[0].name;
  }

  get numberOfComponents(): number {
    return this.components.length;
  }

  get dotSeparatedComponents(): string {
    if (this._dotSeparatedComponents == null) {
      this._dotSeparatedComponents = this.components
        .map((c) => c?.name)
        .join(".");
    }

    return this._dotSeparatedComponents;
  }

  constructor(components: Identifier[], baseFlowLevel?: FlowLevel) {
    this._baseTargetLevel = baseFlowLevel;
    this.components = components;
  }

  ToString(): string {
    if (this.components == null || this.components.length === 0) {
      if (this.baseTargetLevel === FlowLevel.WeavePoint) {
        return "-> <next gather point>";
      }
      return "<invalid Path>";
    }

    return `-> ${this.dotSeparatedComponents}`;
  }

  ResolveFromContext(context: IObject): IObject {
    if (this.components == null || this.components.length === 0) {
      return null;
    }

    // Find base target of path from current context. e.g.
    //   ==> BASE.sub.sub
    const baseTargetObject = this.ResolveBaseTarget(context);
    if (baseTargetObject == null) {
      return null;
    }

    // Given base of path, resolve final target by working deeper into hierarchy
    //  e.g. ==> base.mid.FINAL
    if (this.components.length > 1) {
      return this.ResolveTailComponents(baseTargetObject);
    }

    return baseTargetObject;
  }

  // Find the root object from the base, i.e. root from:
  //    root.sub1.sub2
  private ResolveBaseTarget(originalContext: IObject): IObject {
    const firstComp = this.firstComponent;

    // Work up the ancestry to find the node that has the named object
    let ancestorContext = originalContext;
    while (ancestorContext != null) {
      // Only allow deep search when searching deeper from original context.
      // Don't allow search upward *then* downward, since that's searching *everywhere*!
      // Allowed examples:
      //  - From an inner gather of a stitch, you should search up to find a knot called 'x'
      //    at the root of a story, but not a stitch called 'x' in that knot.
      //  - However, from within a knot, you should be able to find a gather/choice
      //    anywhere called 'x'
      // (that latter example is quite loose, but we allow it)
      const deepSearch = ancestorContext === originalContext;

      const foundBase = this.TryGetChildFromContext(
        ancestorContext,
        firstComp,
        null,
        deepSearch
      );
      if (foundBase != null) {
        return foundBase;
      }

      ancestorContext = ancestorContext.parent;
    }

    return null;
  }

  // Find the final child from path given root, i.e.:
  //   root.sub.finalChild
  private ResolveTailComponents(rootTarget: IObject): IObject {
    let foundComponent: IObject = rootTarget;
    for (let i = 1; i < this.components.length; i += 1) {
      const compName = this.components[i].name;

      let minimumExpectedLevel: FlowLevel;
      if (isFlowBase(foundComponent)) {
        minimumExpectedLevel = foundComponent.flowLevel + 1;
      } else {
        minimumExpectedLevel = FlowLevel.WeavePoint;
      }

      foundComponent = this.TryGetChildFromContext(
        foundComponent,
        compName,
        minimumExpectedLevel
      );
      if (foundComponent == null) {
        break;
      }
    }

    return foundComponent;
  }

  // See whether "context" contains a child with a given name at a given flow level
  // Can either be a named knot/stitch (a FlowBase) or a weave point within a Weave (Choice or Gather)
  // This function also ignores any other object types that are neither FlowBase nor Weave.
  // Called from both ResolveBase (force deep) and ResolveTail for the individual components.
  private TryGetChildFromContext(
    context: IObject,
    childName: string,
    minimumLevel?: FlowLevel,
    forceDeepSearch = false
  ): IObject {
    // null childLevel means that we don't know where to find it
    const ambiguousChildLevel = minimumLevel == null;

    // Search for WeavePoint within Weave
    if (
      isWeave(context) &&
      (ambiguousChildLevel || minimumLevel === FlowLevel.WeavePoint)
    ) {
      return context.WeavePointNamed(childName);
    }

    // Search for content within Flow (either a sub-Flow or a WeavePoint)
    if (isFlowBase(context)) {
      // When searching within a Knot, allow a deep searches so that
      // named weave points (choices and gathers) can be found within any stitch
      // Otherwise, we just search within the immediate object.
      const shouldDeepSearch =
        forceDeepSearch || context.flowLevel === FlowLevel.Knot;
      return context.ContentWithNameAtLevel(
        childName,
        minimumLevel,
        shouldDeepSearch
      );
    }

    return null;
  }
}
