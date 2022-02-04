import { PathComponent } from "./PathComponent";

export class Path {
  public _isRelative: boolean;

  public _components: PathComponent[];

  public _componentsString: string;

  constructor();

  constructor(componentsString: string);

  constructor(head: PathComponent, tail: Path);

  constructor(head: PathComponent[], relative?: boolean);

  constructor(...args) {
    this._components = [];
    this._componentsString = null;
    this._isRelative = false;

    if (typeof args[0] === "string") {
      const componentsString = args[0] as string;
      this.componentsString = componentsString;
    } else if (args[0] instanceof PathComponent && args[1] instanceof Path) {
      const head = args[0] as PathComponent;
      const tail = args[1] as Path;
      this._components.push(head);
      this._components = this._components.concat(tail._components);
    } else if (args[0] instanceof Array) {
      const head = args[0] as PathComponent[];
      const relative = !!args[1] as boolean;
      this._components = this._components.concat(head);
      this._isRelative = relative;
    }
  }

  get isRelative(): boolean {
    return this._isRelative;
  }

  get componentCount(): number {
    return this._components.length;
  }

  get head(): PathComponent {
    if (this._components.length > 0) {
      return this._components[0];
    }
    return null;
  }

  get tail(): Path {
    if (this._components.length >= 2) {
      // careful, the original code uses length-1 here. This is because the second argument of
      // List.GetRange is a number of elements to extract, wherease Array.slice uses an index
      const tailComps = this._components.slice(1, this._components.length);
      return new Path(tailComps);
    }
    return Path.self;
  }

  get length(): number {
    return this._components.length;
  }

  get lastComponent(): PathComponent {
    const lastComponentIdx = this._components.length - 1;
    if (lastComponentIdx >= 0) {
      return this._components[lastComponentIdx];
    }
    return null;
  }

  get containsNamedComponent(): boolean {
    for (let i = 0, l = this._components.length; i < l; i += 1) {
      if (!this._components[i].isIndex) {
        return true;
      }
    }
    return false;
  }

  static get self(): Path {
    const path = new Path();
    path._isRelative = true;
    return path;
  }

  public GetComponent(index: number): PathComponent {
    return this._components[index];
  }

  public PathByAppendingPath(pathToAppend: Path): Path {
    const p = new Path();

    let upwardMoves = 0;
    for (let i = 0; i < pathToAppend._components.length; i += 1) {
      if (pathToAppend._components[i].isParent) {
        upwardMoves += 1;
      } else {
        break;
      }
    }

    for (let i = 0; i < this._components.length - upwardMoves; i += 1) {
      p._components.push(this._components[i]);
    }

    for (let i = upwardMoves; i < pathToAppend._components.length; i += 1) {
      p._components.push(pathToAppend._components[i]);
    }

    return p;
  }

  get componentsString(): string {
    if (this._componentsString == null) {
      this._componentsString = this._components.join(".");
      if (this.isRelative) {
        this._componentsString = `.${this._componentsString}`;
      }
    }

    return this._componentsString;
  }

  set componentsString(value: string) {
    this._components.length = 0;

    this._componentsString = value;

    if (this._componentsString == null || this._componentsString === "") {
      return;
    }

    if (this._componentsString[0] === ".") {
      this._isRelative = true;
      this._componentsString = this._componentsString.substring(1);
    }

    const componentStrings = this._componentsString.split(".");
    componentStrings.forEach((str) => {
      // we need to distinguish between named components that start with a number, eg "42somewhere", and indexed components
      // the normal parseInt won't do for the detection because it's too relaxed.
      // see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/parseInt
      if (/^(-|\+)?([0-9]+|Infinity)$/.test(str)) {
        this._components.push(new PathComponent(Number(str)));
      } else {
        this._components.push(new PathComponent(str));
      }
    });
  }

  public toString(): string {
    return this.componentsString;
  }

  public Equals(otherPath: Path): boolean {
    if (otherPath == null) {
      return false;
    }

    if (otherPath._components.length !== this._components.length) {
      return false;
    }

    if (otherPath.isRelative !== this.isRelative) {
      return false;
    }

    // the original code uses SequenceEqual here, so we need to iterate over the components manually.
    for (let i = 0, l = otherPath._components.length; i < l; i += 1) {
      // it's not quite clear whether this test should use Equals or a simple == operator,
      // see https://github.com/y-lohse/inkjs/issues/22
      if (!otherPath._components[i].Equals(this._components[i])) {
        return false;
      }
    }

    return true;
  }

  public PathByAppendingComponent(c: PathComponent): Path {
    const p = new Path();
    p._components.push(...this._components);
    p._components.push(c);
    return p;
  }
}
