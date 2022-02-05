import {
  Container,
  DebugMetadata,
  Path,
  RuntimeObject,
  StringBuilder,
} from "../../../impower-script-engine";
import { FindQueryFunc } from "../../types/FindQueryFunc";
import { FlowLevel } from "../../types/FlowLevel";
import { Identifier } from "../../types/Identifier";
import { IFlowBase } from "../../types/IFlowBase";
import { IObject } from "../../types/IObject";
import { isStory, IStory } from "../../types/IStory";
import { isWeavePoint } from "../../types/IWeavePoint";
import { isFlowBase } from "../../utils/isFlowBase";
import { ParsedPath } from "./ParsedPath";

export abstract class ParsedObject implements IObject {
  parent: IObject = null;

  content: IObject[] = null;

  alreadyHadError = false;

  alreadyHadWarning = false;

  private _debugMetadata: DebugMetadata = null;

  private _runtimeObject: RuntimeObject = null;

  get debugMetadata(): DebugMetadata {
    if (this._debugMetadata == null) {
      if (this.parent) {
        return this.parent.debugMetadata;
      }
    }

    return this._debugMetadata;
  }

  set debugMetadata(value: DebugMetadata) {
    this._debugMetadata = value;
  }

  get hasOwnDebugMetadata(): boolean {
    return this._debugMetadata != null;
  }

  get typeName(): string {
    return "Object";
  }

  get story(): IStory {
    let ancestor = this.parent;
    while (ancestor.parent) {
      ancestor = ancestor.parent;
    }
    if (isStory(ancestor)) {
      return ancestor;
    }
    return null;
  }

  get runtimeObject(): RuntimeObject {
    if (this._runtimeObject == null) {
      this._runtimeObject = this.GenerateRuntimeObject();
      if (this._runtimeObject)
        this._runtimeObject.debugMetadata = this.debugMetadata;
    }
    return this._runtimeObject;
  }

  set runtimeObject(value: RuntimeObject) {
    this._runtimeObject = value;
  }

  // virtual so that certian object types can return a different
  // path than just the path to the main runtimeObject.
  // e.g. a Choice returns a path to its content rather than
  // its outer container.
  get runtimePath(): Path {
    return this.runtimeObject.path;
  }

  // When counting visits and turns since, different object
  // types may have different containers that needs to be counted.
  // For most it'll just be the object's main runtime object,
  // but for e.g. choices, it'll be the target container.
  get containerForCounting(): Container {
    return this.runtimeObject as Container;
  }

  public PathRelativeTo(otherObj: IObject): ParsedPath {
    const ownAncestry = this.ancestry;
    const otherAncestry = otherObj.ancestry;

    let highestCommonAncestor = null;
    const minLength = Math.min(ownAncestry.length, otherAncestry.length);
    for (let i = 0; i < minLength; i += 1) {
      const a1 = this.ancestry[i];
      const a2 = otherAncestry[i];
      if (a1 === a2) {
        highestCommonAncestor = a1;
      } else {
        break;
      }
    }

    let commonFlowAncestor = highestCommonAncestor as IFlowBase;
    if (commonFlowAncestor == null) {
      commonFlowAncestor = highestCommonAncestor.ClosestFlowBase();
    }

    const pathComponents: Identifier[] = [];
    let hasWeavePoint = false;
    let baseFlow = FlowLevel.WeavePoint;

    let ancestor = this as IObject;
    while (
      ancestor &&
      !ancestor.Equals(commonFlowAncestor) &&
      !isStory(ancestor)
    ) {
      if (ancestor.Equals(commonFlowAncestor)) {
        break;
      }

      let skipToNext = false;
      if (!hasWeavePoint) {
        if (
          isWeavePoint(ancestor) &&
          ancestor != null &&
          ancestor.identifier != null
        ) {
          pathComponents.push(ancestor.identifier);
          hasWeavePoint = true;
          skipToNext = true;
        }
      }

      if (!skipToNext) {
        if (isFlowBase(ancestor)) {
          pathComponents.push(ancestor.identifier);
          baseFlow = ancestor.flowLevel;
        }

        ancestor = ancestor.parent;
      }
    }

    pathComponents.reverse();

    if (pathComponents.length > 0) {
      return new ParsedPath(pathComponents, baseFlow);
    }

    return null;
  }

  get ancestry(): IObject[] {
    const result = [];

    let ancestor = this.parent;
    while (ancestor) {
      result.push(ancestor);
      ancestor = ancestor.parent;
    }

    result.reverse();

    return result;
  }

  get descriptionOfScope(): string {
    const locationNames: string[] = [];

    let ancestor = this.parent;
    while (ancestor) {
      const ancestorFlow = ancestor;
      if (isFlowBase(ancestorFlow) && ancestorFlow.identifier != null) {
        locationNames.push(`'${ancestorFlow.identifier}'`);
      }
      ancestor = ancestor.parent;
    }

    const scopeSB = new StringBuilder();
    if (locationNames.length > 0) {
      const locationsListStr = locationNames.join(", ");
      scopeSB.Append(locationsListStr);
      scopeSB.Append(" and ");
    }

    scopeSB.Append("at top scope");

    return scopeSB.ToString();
  }

  AddContent<T extends IObject>(subContent: T | T[]): T {
    if (Array.isArray(subContent)) {
      subContent.forEach((obj) => {
        this.AddContent(obj);
      });
      return subContent?.[0];
    }

    if (this.content == null) {
      this.content = [];
    }

    // Make resilient to content not existing, which can happen
    // in the case of parse errors where we've already reported
    // an error but still want a valid structure so we can
    // carry on parsing.
    if (subContent) {
      subContent.parent = this;
      this.content.push(subContent);
    }

    return subContent;
  }

  InsertContent<T extends IObject>(index: number, subContent: T): T {
    if (this.content == null) {
      this.content = [];
    }

    subContent.parent = this;
    this.content[index] = subContent;

    return subContent;
  }

  Find<T extends IObject>(queryFunc?: FindQueryFunc<T>): T {
    const tObj = this as unknown as T;
    if (tObj != null && (!queryFunc || queryFunc(tObj) === true)) {
      return tObj;
    }

    if (this.content == null) return null;

    for (let i = 0; i < this.content.length; i += 1) {
      const obj = this.content[i];
      const nestedResult = obj.Find(queryFunc);
      if (nestedResult != null) {
        return nestedResult;
      }
    }

    return null;
  }

  FindAll<T>(queryFunc?: FindQueryFunc<T>, foundSoFar?: T[]): T[] {
    const tObj = this as unknown as T;
    if (!foundSoFar) {
      foundSoFar = [];
    }

    if (tObj != null && (!queryFunc || queryFunc(tObj) === true)) {
      foundSoFar.push(tObj);
    }

    if (this.content == null) {
      return foundSoFar;
    }

    this.content.forEach((obj) => {
      obj.FindAll(queryFunc, foundSoFar);
    });

    return foundSoFar;
  }

  abstract GenerateRuntimeObject(): RuntimeObject;

  ResolveReferences(context: IStory): void {
    if (this.content != null) {
      this.content.forEach((obj) => {
        obj.ResolveReferences(context);
      });
    }
  }

  ClosestFlowBase(): IFlowBase {
    if (isFlowBase(this)) {
      return this;
    }
    let ancestor = this.parent;
    while (ancestor) {
      if (isFlowBase(ancestor)) {
        return ancestor;
      }
      ancestor = ancestor.parent;
    }

    return null;
  }

  Error(message: string, source?: IObject, isWarning = false): void {
    if (!source) {
      source = this;
    }

    // Only allow a single parsed object to have a single error *directly* associated with it
    if (source.alreadyHadError && !isWarning) {
      return;
    }
    if (source.alreadyHadWarning && isWarning) {
      return;
    }

    if (this.parent) {
      this.parent.Error(message, source, isWarning);
    } else {
      throw new Error(`No parent object to send error to: ${message}`);
    }

    if (isWarning) {
      source.alreadyHadWarning = true;
    } else {
      source.alreadyHadError = true;
    }
  }

  public Warning(message: string, source: IObject = null): void {
    this.Error(message, source, true);
  }

  ToString(): string {
    return "";
  }

  Equals(obj: unknown): boolean {
    return obj === this;
  }
}
