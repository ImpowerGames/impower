import { Container, VariableReference } from "../../../impower-script-engine";
import { isContentList } from "../../types/IContentList";
import { Identifier } from "../../types/Identifier";
import { IExpression } from "../../types/IExpression";
import { isFlowBase } from "../../types/IFlowBase";
import { IIdentifiable } from "../../types/IIdentifiable";
import { INamedContent } from "../../types/INamedContent";
import { IStory } from "../../types/IStory";
import { isWeave } from "../../types/IWeave";
import { ParsedExpression } from "./ParsedExpression";
import { ParsedPath } from "./ParsedPath";

export class ParsedVariableReference
  extends ParsedExpression
  implements INamedContent, IIdentifiable
{
  // - Normal variables have a single item in their "path"
  // - Knot/stitch names for read counts are actual dot-separated paths
  //   (though this isn't actually used at time of writing)
  // - List names are dot separated: listName.itemName (or just itemName)
  name: string = null;

  pathIdentifiers: Identifier[] = null;

  path: string[] = null;

  // Only known after GenerateIntoContainer has run
  isConstantReference = false;

  isListItemReference = false;

  private _runtimeVarRef: VariableReference;

  private _singleIdentifier: Identifier;

  get runtimeVarRef(): VariableReference {
    return this._runtimeVarRef;
  }

  get identifier(): Identifier {
    // Merging the list of identifiers into a single identifier.
    // Debug metadata is also merged.
    if (this.pathIdentifiers == null || this.pathIdentifiers.length === 0) {
      return null;
    }

    if (this._singleIdentifier == null) {
      const name = this.path.join(".");
      const firstDebugMetadata = this.pathIdentifiers[0].debugMetadata;
      const debugMetadata = this.pathIdentifiers.reduce(
        (acc, id) => acc.Merge(id.debugMetadata),
        firstDebugMetadata
      );
      this._singleIdentifier = { name, debugMetadata };
    }

    return this._singleIdentifier;
  }

  constructor(pathIdentifiers: Identifier[]) {
    super();
    this.pathIdentifiers = pathIdentifiers;
    this.path = pathIdentifiers.map((id) => id?.name);
    this.name = pathIdentifiers.join(".");
  }

  override GenerateIntoContainer(container: Container): void {
    const constantValue: IExpression = this.story.constants[this.name];

    // If it's a constant reference, just generate the literal expression value
    // It's okay to access the constants at code generation time, since the
    // first thing the ExportRuntime function does it search for all the constants
    // in the story hierarchy, so they're all available.
    if (constantValue !== undefined) {
      constantValue.GenerateConstantIntoContainer(container);
      this.isConstantReference = true;
      return;
    }

    this._runtimeVarRef = new VariableReference(this.name);

    // List item reference?
    // Path might be to a list (listName.listItemName or just listItemName)
    if (this.path.length === 1 || this.path.length === 2) {
      let listItemName: string = null;
      let listName: string = null;

      if (this.path.length === 1) {
        [listItemName] = this.path;
      } else {
        [listName, listItemName] = this.path;
      }

      const listItem = this.story.ResolveListItem(listName, listItemName, this);
      if (listItem) {
        this.isListItemReference = true;
      }
    }

    container.AddContent(this._runtimeVarRef);
  }

  override ResolveReferences(context: IStory): void {
    super.ResolveReferences(context);

    // Work is already done if it's a constant or list item reference
    if (this.isConstantReference || this.isListItemReference) {
      return;
    }

    // Is it a read count?
    const parsedPath = new ParsedPath(this.pathIdentifiers);
    const targetForCount = parsedPath.ResolveFromContext(this);
    if (targetForCount) {
      targetForCount.containerForCounting.visitsShouldBeCounted = true;

      // If this is an argument to a function that wants a variable to be
      // passed by reference, then the Parsed.Divert will have generated a
      // Runtime.VariablePointerValue instead of allowing this object
      // to generate its RuntimeVariableReference. This only happens under
      // error condition since we shouldn't be passing a read count by
      // reference, but we don't want it to crash!
      if (this._runtimeVarRef == null) {
        return;
      }

      this._runtimeVarRef.pathForCount = targetForCount.runtimePath;
      this._runtimeVarRef.name = null;

      // Check for very specific writer error: getting read count and
      // printing it as content rather than as a piece of logic
      // e.g. Writing {myFunc} instead of {myFunc()}
      if (isFlowBase(targetForCount) && targetForCount.isFunction) {
        // Is parent context content rather than logic?
        if (
          isWeave(this.parent) ||
          isContentList(this.parent) ||
          isFlowBase(this.parent)
        ) {
          this.Warning(
            `'${targetForCount.identifier}' being used as read count rather than being called as function. Perhaps you intended to write ${targetForCount.name}()`
          );
        }
      }

      return;
    }

    // Couldn't find this multi-part path at all, whether as a divert
    // target or as a list item reference.
    if (this.path.length > 1) {
      let errorMsg = `Could not find target for read count: ${parsedPath}`;
      if (this.path.length <= 2) {
        errorMsg += `, or couldn't find list item with the name ${this.path.join(
          ","
        )}`;
      }
      this.Error(errorMsg);
      return;
    }

    if (!context.ResolveVariableWithName(this.name, this).found) {
      this.Error(`Unresolved variable: ${this.ToString()}`, this);
    }
  }

  override ToString(): string {
    return this.path.join(".");
  }
}
