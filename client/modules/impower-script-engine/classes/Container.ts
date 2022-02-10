import { CountFlags } from "../types/CountFlags";
import { IContainer } from "../types/IContainer";
import { INamedContent, isNamedContent } from "../types/INamedContent";
import { Debug } from "./Debug";
import { NullException } from "./NullException";
import { Path } from "./Path";
import { PathComponent } from "./PathComponent";
import { RuntimeObject } from "./RuntimeObject";
import { SearchResult } from "./SearchResult";
import { StringBuilder } from "./StringBuilder";
import { StringValue } from "./StringValue";

export class Container extends RuntimeObject implements IContainer {
  public name = "";

  public _content: RuntimeObject[] = [];

  public namedContent: Record<string, INamedContent> = {};

  public visitsShouldBeCounted = false;

  public turnIndexShouldBeCounted = false;

  public countingAtStartOnly = false;

  public _pathToFirstLeafContent: Path = null;

  get hasValidName(): boolean {
    return this.name != null && this.name.length > 0;
  }

  get content(): RuntimeObject[] {
    return this._content;
  }

  set content(value: RuntimeObject[]) {
    this.AddContent(value);
  }

  get namedOnlyContent(): Record<string, RuntimeObject> {
    let namedOnlyContentDict: Record<string, RuntimeObject> = {};

    Object.entries(this.namedContent).forEach(([key, value]) => {
      const inkObject = value as unknown as RuntimeObject;
      namedOnlyContentDict[key] = inkObject;
    });

    this.content.forEach((c) => {
      if (isNamedContent(c) && c != null && c.hasValidName) {
        delete namedOnlyContentDict[c.name];
      }
    });

    if (Object.keys(namedOnlyContentDict).length === 0) {
      namedOnlyContentDict = null;
    }

    return namedOnlyContentDict;
  }

  set namedOnlyContent(value: Record<string, RuntimeObject>) {
    const existingNamedOnly = this.namedOnlyContent;
    if (existingNamedOnly != null) {
      Object.entries(existingNamedOnly).forEach(([key]) => {
        delete this.namedContent[key];
      });
    }

    if (value == null) {
      return;
    }

    Object.entries(value).forEach(([, val]) => {
      if (isNamedContent(val)) {
        this.AddToNamedContentOnly(val);
      }
    });
  }

  get countFlags(): number {
    let flags: CountFlags = 0;
    if (this.visitsShouldBeCounted) {
      flags |= CountFlags.Visits;
    }
    if (this.turnIndexShouldBeCounted) {
      flags |= CountFlags.Turns;
    }
    if (this.countingAtStartOnly) {
      flags |= CountFlags.CountStartOnly;
    }

    if (flags === CountFlags.CountStartOnly) {
      flags = 0;
    }

    return flags;
  }

  set countFlags(value: number) {
    const flag: CountFlags = value;
    if ((flag & CountFlags.Visits) > 0) {
      this.visitsShouldBeCounted = true;
    }
    if ((flag & CountFlags.Turns) > 0) {
      this.turnIndexShouldBeCounted = true;
    }
    if ((flag & CountFlags.CountStartOnly) > 0) {
      this.countingAtStartOnly = true;
    }
  }

  get pathToFirstLeafContent(): Path {
    if (this._pathToFirstLeafContent == null) {
      this._pathToFirstLeafContent = this.path.PathByAppendingPath(
        this.internalPathToFirstLeafContent
      );
    }

    return this._pathToFirstLeafContent;
  }

  get internalPathToFirstLeafContent(): Path {
    const components: PathComponent[] = [];
    let container = this?.content?.[0];
    while (container instanceof Container) {
      if (container?.content?.length > 0) {
        components.push(new PathComponent(0));
        if (container?.content?.[0] instanceof Container) {
          container = container?.content?.[0];
        }
      }
    }
    return new Path(components);
  }

  override Copy(): Container {
    const obj = new Container();
    obj.name = this.name;
    obj._content = this._content ? [...this._content] : this._content;
    obj.namedContent = this.namedContent
      ? { ...this.namedContent }
      : this.namedContent;
    obj.visitsShouldBeCounted = this.visitsShouldBeCounted;
    obj.turnIndexShouldBeCounted = this.turnIndexShouldBeCounted;
    obj.countingAtStartOnly = this.countingAtStartOnly;
    obj._pathToFirstLeafContent = this._pathToFirstLeafContent;
    return obj;
  }

  public AddContent(contentObjOrList: RuntimeObject | RuntimeObject[]): void {
    if (Array.isArray(contentObjOrList)) {
      contentObjOrList.forEach((c) => {
        this.AddContent(c);
      });
    } else {
      this._content.push(contentObjOrList);

      if (contentObjOrList.parent) {
        throw new Error(`content is already in ${contentObjOrList.parent}`);
      }

      contentObjOrList.parent = this;

      this.TryAddNamedContent(contentObjOrList);
    }
  }

  public TryAddNamedContent(contentObj: RuntimeObject): void {
    if (isNamedContent(contentObj) && contentObj.hasValidName) {
      this.AddToNamedContentOnly(contentObj);
    }
  }

  public AddToNamedContentOnly(namedContentObj: RuntimeObject): void {
    if (isNamedContent(namedContentObj)) {
      const runtimeObj = namedContentObj as unknown as RuntimeObject;
      runtimeObj.parent = this;
      this.namedContent[namedContentObj.name] = namedContentObj;
    }
  }

  public ContentAtPath(
    path: Path,
    partialPathStart = 0,
    partialPathLength = -1
  ): SearchResult {
    if (partialPathLength === -1) {
      partialPathLength = path.length;
    }

    const result = new SearchResult();
    result.approximate = false;

    let currentContainer = this as Container;
    let currentObj = this as RuntimeObject;

    for (let i = partialPathStart; i < partialPathLength; i += 1) {
      const comp = path.GetComponent(i);
      if (currentContainer == null) {
        result.approximate = true;
        break;
      }

      const foundObj: RuntimeObject =
        currentContainer.ContentWithPathComponent(comp);

      if (foundObj == null) {
        result.approximate = true;
        break;
      }

      currentObj = foundObj;
      if (foundObj instanceof Container) {
        currentContainer = foundObj;
      }
    }

    result.obj = currentObj;

    return result;
  }

  public InsertContent(contentObj: RuntimeObject, index: number): void {
    this.content.splice(index, 0, contentObj);

    if (contentObj.parent) {
      throw new Error(`content is already in ${contentObj.parent}`);
    }

    contentObj.parent = this;

    this.TryAddNamedContent(contentObj);
  }

  public AddContentsOfContainer(otherContainer: Container): void {
    otherContainer.content.forEach((obj) => {
      obj.parent = null;
    });
    this.content = otherContainer.content;

    otherContainer.content.forEach((obj) => {
      obj.parent = this;
      this.TryAddNamedContent(obj);
    });
  }

  public ContentWithPathComponent(component: PathComponent): RuntimeObject {
    if (component.isIndex) {
      if (component.index >= 0 && component.index < this.content.length) {
        return this.content[component.index];
      }
      return null;
    }
    if (component.isParent) {
      return this.parent;
    }
    if (component.name === null) {
      throw new NullException("component.name");
    }
    const foundContent = this.namedContent[component.name];
    if (foundContent !== undefined) {
      return foundContent as unknown as RuntimeObject;
    }
    return null;
  }

  public BuildStringOfHierarchy(
    sb?: StringBuilder,
    indentation?: number,
    pointedObj?: RuntimeObject
  ): string {
    if (!sb && !indentation && !pointedObj) {
      sb = new StringBuilder();
      this.BuildStringOfHierarchy(sb, 0, null);
      return sb.ToString();
    }

    function appendIndentation(): void {
      const spacesPerIndent = 4; // Truly const in the original code
      for (let i = 0; i < spacesPerIndent * indentation; i += 1) {
        sb.Append(" ");
      }
    }

    appendIndentation();
    sb.Append("[");

    if (this.hasValidName) {
      sb.AppendFormat(" ({0})", this.name);
    }

    if (this === pointedObj) {
      sb.Append("  <---");
    }

    sb.AppendLine();

    indentation += 1;

    for (let i = 0; i < this.content.length; i += 1) {
      const obj = this.content[i];

      const container = obj;
      if (container instanceof Container) {
        container.BuildStringOfHierarchy(sb, indentation, pointedObj);
      } else {
        appendIndentation();
        if (obj instanceof StringValue) {
          sb.Append('"');
          sb.Append(obj.toString().replace("\n", "\\n"));
          sb.Append('"');
        } else {
          sb.Append(obj.toString());
        }
      }

      if (i !== this.content.length - 1) {
        sb.Append(",");
      }

      if (!(obj instanceof Container) && obj === pointedObj) {
        sb.Append("  <---");
      }

      sb.AppendLine();
    }

    const onlyNamed: Record<string, INamedContent> = {};

    Object.entries(this.namedContent).forEach(([key, value]) => {
      if (this.content.indexOf(value as unknown as RuntimeObject) < 0) {
        onlyNamed[key] = value;
      }
    });

    const onlyNamedEntries = Object.entries(onlyNamed);
    if (onlyNamedEntries.length > 0) {
      appendIndentation();
      sb.AppendLine("-- named: --");

      onlyNamedEntries.forEach(([, value]) => {
        Debug.AssertType(
          value,
          Container,
          "Can only print out named Containers"
        );
        const container = value instanceof Container ? value : null;
        container.BuildStringOfHierarchy(sb, indentation, pointedObj);
        sb.AppendLine();
      });
    }

    indentation -= 1;

    appendIndentation();
    sb.Append("]");

    return sb.ToString();
  }
}
