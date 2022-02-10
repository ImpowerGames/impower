import { IContainer, isContainer } from "../types/IContainer";
import { isNamedContent } from "../types/INamedContent";
import { IObject } from "../types/IObject";
import { Debug } from "./Debug";
import { DebugMetadata } from "./DebugMetadata";
import { NullException } from "./NullException";
import { Path } from "./Path";
import { PathComponent } from "./PathComponent";
import { SearchResult } from "./SearchResult";

export abstract class RuntimeObject implements IObject {
  public parent: RuntimeObject = null;

  private _debugMetadata: DebugMetadata = null;

  private _path: Path = null;

  get debugMetadata(): DebugMetadata {
    if (this._debugMetadata === null) {
      if (this.parent) {
        return this.parent.debugMetadata;
      }
    }

    return this._debugMetadata;
  }

  set debugMetadata(value) {
    this._debugMetadata = value;
  }

  get ownDebugMetadata(): DebugMetadata {
    return this._debugMetadata;
  }

  public DebugLineNumberOfPath(path: Path): number {
    if (path === null) {
      return null;
    }

    // Try to get a line number from debug metadata
    const root = this.rootContentContainer;
    if (root) {
      const targetContent = root.ContentAtPath(path).obj;
      if (targetContent) {
        const dm = targetContent.debugMetadata;
        if (dm !== null) {
          return dm.startLineNumber;
        }
      }
    }

    return null;
  }

  get path(): Path {
    if (this._path == null) {
      if (this.parent == null) {
        this._path = new Path();
      } else {
        const comps: PathComponent[] = [];

        let child = this as RuntimeObject;
        let container = isContainer(child.parent) ? child.parent : null;

        while (container !== null) {
          const namedChild = isNamedContent(child) ? child : null;
          if (namedChild != null && namedChild.hasValidName) {
            comps.unshift(new PathComponent(namedChild.name));
          } else {
            comps.unshift(new PathComponent(container.content.indexOf(child)));
          }

          child = container;
          container = isContainer(container.parent) ? container.parent : null;
        }

        this._path = new Path(comps);
      }
    }

    return this._path;
  }

  public ResolvePath(path: Path): SearchResult {
    if (path === null) {
      throw new NullException("path");
    }
    if (path.isRelative) {
      const nearestContainer = this.parent;

      if (nearestContainer === null) {
        Debug.Assert(
          this.parent !== null,
          "Can't resolve relative path because we don't have a parent"
        );
        return null;
      }
      Debug.Assert(path.GetComponent(0).isParent);
      path = path.tail;

      if (nearestContainer === null) {
        throw new NullException("nearestContainer");
      }
      return (
        isContainer(nearestContainer) ? nearestContainer : null
      ).ContentAtPath(path);
    }
    const contentContainer = this.rootContentContainer;
    if (contentContainer === null) {
      throw new NullException("contentContainer");
    }
    return contentContainer.ContentAtPath(path);
  }

  public ConvertPathToRelative(globalPath: Path): Path {
    const ownPath = this.path;

    const minPathLength = Math.min(globalPath.length, ownPath.length);
    let lastSharedPathCompIndex = -1;

    for (let i = 0; i < minPathLength; i += 1) {
      const ownComp = ownPath.GetComponent(i);
      const otherComp = globalPath.GetComponent(i);

      if (ownComp.Equals(otherComp)) {
        lastSharedPathCompIndex = i;
      } else {
        break;
      }
    }

    // No shared path components, so just use global path
    if (lastSharedPathCompIndex === -1) {
      return globalPath;
    }

    const numUpwardsMoves =
      ownPath.componentCount - 1 - lastSharedPathCompIndex;

    const newPathComps: PathComponent[] = [];

    for (let up = 0; up < numUpwardsMoves; up += 1) {
      newPathComps.push(PathComponent.ToParent());
    }

    for (
      let down = lastSharedPathCompIndex + 1;
      down < globalPath.componentCount;
      down += 1
    ) {
      newPathComps.push(globalPath.GetComponent(down));
    }

    const relativePath = new Path(newPathComps, true);
    return relativePath;
  }

  public CompactPathString(otherPath: Path): string {
    let globalPathStr = null;
    let relativePathStr = null;

    if (otherPath.isRelative) {
      relativePathStr = otherPath.componentsString;
      globalPathStr = this.path.PathByAppendingPath(otherPath).componentsString;
    } else {
      const relativePath = this.ConvertPathToRelative(otherPath);
      relativePathStr = relativePath.componentsString;
      globalPathStr = otherPath.componentsString;
    }

    if (relativePathStr.length < globalPathStr.length) {
      return relativePathStr;
    }
    return globalPathStr;
  }

  get rootContentContainer(): IContainer {
    let ancestor = this as IObject;
    while (ancestor.parent) {
      ancestor = ancestor.parent;
    }
    return isContainer(ancestor) ? ancestor : null;
  }

  public abstract Copy(): RuntimeObject;

  // SetChild works slightly differently in the js implementation.
  // Since we can't pass an objects property by reference, we instead pass
  // the object and the property string.
  // TODO: This method can probably be rewritten with type-safety in mind.
  public SetChild(
    obj: Record<string, RuntimeObject>,
    prop: string,
    value: RuntimeObject
  ): void {
    if (obj[prop]) {
      obj[prop] = null;
    }

    obj[prop] = value;

    if (obj[prop]) {
      obj[prop].parent = this;
    }
  }
}
