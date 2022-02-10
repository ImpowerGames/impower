import { Container } from "./Container";
import { Path } from "./Path";
import { RuntimeObject } from "./RuntimeObject";

export class VariableReference extends RuntimeObject {
  public name: string = null;

  public pathForCount: Path = null;

  get containerForCount(): Container {
    if (this.pathForCount === null) {
      return null;
    }
    return this.ResolvePath(this.pathForCount).container;
  }

  get pathStringForCount(): string {
    if (this.pathForCount === null) {
      return null;
    }

    return this.CompactPathString(this.pathForCount);
  }

  set pathStringForCount(value: string) {
    if (value === null) this.pathForCount = null;
    else this.pathForCount = new Path(value);
  }

  constructor(name: string = null) {
    super();
    this.name = name;
  }

  override Copy(): VariableReference {
    const obj = new VariableReference();
    obj.name = this.name;
    obj.pathForCount = this.pathForCount;
    return obj;
  }

  public toString(): string {
    if (this.name != null) {
      return `var(${this.name})`;
    }
    const pathStr = this.pathStringForCount;
    return `read_count(${pathStr})`;
  }
}
