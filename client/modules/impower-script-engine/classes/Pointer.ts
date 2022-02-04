import { Container } from "./Container";
import { ImpowerObject } from "./ImpowerObject";
import { Path } from "./Path";
import { PathComponent } from "./PathComponent";

export class Pointer {
  public container: Container = null;

  public index = -1;

  constructor();

  constructor(container: Container, index: number);

  constructor(...args) {
    if (args.length === 2) {
      [this.container, this.index] = args;
    }
  }

  public Resolve(): ImpowerObject {
    if (this.index < 0) {
      return this.container;
    }
    if (this.container == null) {
      return null;
    }
    if (this.container.content.length === 0) {
      return this.container;
    }
    if (this.index >= this.container.content.length) {
      return null;
    }

    return this.container.content[this.index];
  }

  get isNull(): boolean {
    return this.container == null;
  }

  get path(): Path {
    if (this.isNull) {
      return null;
    }

    if (this.index >= 0) {
      return this.container?.path.PathByAppendingComponent(
        new PathComponent(this.index)
      );
    }
    return this.container?.path;
  }

  public toString(): string {
    if (!this.container) {
      return "Pointer (null)";
    }

    return `Pointer -> ${this.container.path.toString()} -- index ${
      this.index
    }`;
  }

  // This method does not exist in the original C# code, but is here to maintain the
  // value semantics of Pointer.
  public copy(): Pointer {
    return new Pointer(this.container, this.index);
  }

  public static StartOf(container: Container): Pointer {
    return new Pointer(container, 0);
  }

  public static get Null(): Pointer {
    return new Pointer(null, -1);
  }
}
