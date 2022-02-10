const PARENT_ID = "^";

export class PathComponent {
  public readonly index: number;

  public readonly name: string;

  constructor(indexOrName: string | number) {
    this.index = -1;
    this.name = null;
    if (typeof indexOrName === "string") {
      this.name = indexOrName;
    } else {
      this.index = indexOrName;
    }
  }

  get isIndex(): boolean {
    return this.index >= 0;
  }

  get isParent(): boolean {
    return this.name === PARENT_ID;
  }

  public Copy(): PathComponent {
    const obj = new PathComponent(this.name || this.index);
    return obj;
  }

  public static ToParent(): PathComponent {
    return new PathComponent(PARENT_ID);
  }

  public toString(): string {
    if (this.isIndex) {
      return this.index.toString();
    }
    return this.name;
  }

  public Equals(otherComp: PathComponent): boolean {
    if (otherComp != null && otherComp.isIndex === this.isIndex) {
      if (this.isIndex) {
        return this.index === otherComp.index;
      }
      return this.name === otherComp.name;
    }

    return false;
  }
}
