export class SimpleJson {
  public static TextToDictionary(text: string) {
    return new SimpleJson.Reader(text).ToDictionary();
  }

  public static TextToArray(text: string) {
    return new SimpleJson.Reader(text).ToArray();
  }
}

export namespace SimpleJson {
  export class Reader {
    constructor(text: string) {
      const nativeFloatParsing = JSON.parse(
        "0",
        // @ts-expect-error : typing
        (_, __, context) => context != null,
      );

      if (!nativeFloatParsing) {
        const jsonWithExplicitFloat = text.replace(
          /(,\s*)([0-9]+\.[0]+)([,]*)/g,
          '$1"$2f"$3',
        );
        this._rootObject = JSON.parse(jsonWithExplicitFloat);
      } else {
        // @ts-expect-error : typing
        const explicitFloatReviver = (_, value, context) => {
          if (Number.isInteger(value) && context.source.endsWith(".0")) {
            return context.source + "f";
          }
          return value;
        };
        // @ts-expect-error : typing
        this._rootObject = JSON.parse(text, explicitFloatReviver);
      }
    }

    public ToDictionary() {
      return this._rootObject as Record<string, any>;
    }

    public ToArray() {
      return this._rootObject as any[];
    }

    private _rootObject: any[] | Record<string, any>;
  }

  export class Writer {
    public InjectObject(name: string, obj: any) {
      this._jsonObject ??= {};
      (this._jsonObject as any)[name] = obj;
    }

    public WriteObject(inner: (w: Writer) => void) {
      this.WriteObjectStart();
      inner(this);
      this.WriteObjectEnd();
    }

    public WriteObjectStart() {
      this.StartNewObject(true);

      let newObject: Record<string, any> = {};

      if (this.state === SimpleJson.Writer.State.Property) {
        this.Assert(this.currentCollection !== null);
        this.Assert(this.currentPropertyName !== null);

        let propertyName = this._propertyNameStack.pop();
        this.currentCollection![propertyName!] = newObject;
        this._collectionStack.push(newObject);
      } else if (this.state === SimpleJson.Writer.State.Array) {
        this.Assert(this.currentCollection !== null);

        this.currentCollection!["push"](newObject);
        this._collectionStack.push(newObject);
      } else {
        this.Assert(this.state === SimpleJson.Writer.State.None);
        this._jsonObject = newObject;
        this._collectionStack.push(newObject);
      }

      this._pushState(SimpleJson.Writer.State.Object);
    }

    public WriteObjectEnd() {
      this.Assert(this.state === SimpleJson.Writer.State.Object);
      this._collectionStack.pop();
      this._popState();
    }

    public WriteProperty(
      name: any,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _innerOrContent: ((w: Writer) => void) | string | boolean | null,
    ) {
      this.WritePropertyStart(name);
      if (arguments[1] instanceof Function) {
        let inner = arguments[1];
        inner(this);
      } else {
        let content: string | boolean | null = arguments[1];
        this.Write(content);
      }
      this.WritePropertyEnd();
    }

    public WriteIntProperty(name: any, content: number) {
      this.WritePropertyStart(name);
      this.WriteInt(content);
      this.WritePropertyEnd();
    }

    public WriteFloatProperty(name: any, content: number) {
      this.WritePropertyStart(name);
      this.WriteFloat(content);
      this.WritePropertyEnd();
    }

    public WritePropertyStart(name: any) {
      this.Assert(this.state === SimpleJson.Writer.State.Object);
      this._propertyNameStack.push(name);

      this.IncrementChildCount();

      this._pushState(SimpleJson.Writer.State.Property);
    }

    public WritePropertyEnd() {
      this.Assert(this.state === SimpleJson.Writer.State.Property);
      this.Assert(this.childCount === 1);
      this._popState();
    }

    public WritePropertyNameStart() {
      this.Assert(this.state === SimpleJson.Writer.State.Object);
      this.IncrementChildCount();

      this._currentPropertyName = "";

      this._pushState(SimpleJson.Writer.State.Property);
      this._pushState(SimpleJson.Writer.State.PropertyName);
    }

    public WritePropertyNameEnd() {
      this.Assert(this.state === SimpleJson.Writer.State.PropertyName);
      this.Assert(this._currentPropertyName !== null);
      this._propertyNameStack.push(this._currentPropertyName!);
      this._currentPropertyName = null;
      this._popState();
    }

    public WritePropertyNameInner(str: string) {
      this.Assert(this.state === SimpleJson.Writer.State.PropertyName);
      this.Assert(this._currentPropertyName !== null);
      this._currentPropertyName += str;
    }

    public WriteArrayStart() {
      this.StartNewObject(true);

      let newObject: any[] = [];

      if (this.state === SimpleJson.Writer.State.Property) {
        this.Assert(this.currentCollection !== null);
        this.Assert(this.currentPropertyName !== null);

        let propertyName = this._propertyNameStack.pop();
        this.currentCollection![propertyName!] = newObject;
        this._collectionStack.push(newObject);
      } else if (this.state === SimpleJson.Writer.State.Array) {
        this.Assert(this.currentCollection !== null);

        this.currentCollection!["push"](newObject);
        this._collectionStack.push(newObject);
      } else {
        this.Assert(this.state === SimpleJson.Writer.State.None);
        this._jsonObject = newObject;
        this._collectionStack.push(newObject);
      }

      this._pushState(SimpleJson.Writer.State.Array);
    }

    public WriteArrayEnd() {
      this.Assert(this.state === SimpleJson.Writer.State.Array);
      this._collectionStack.pop();
      this._popState();
    }

    public Write(
      value: number | string | boolean | null,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _escape: boolean = true,
    ) {
      this.StartNewObject(false);
      this._addToCurrentObject(value);
    }

    public WriteBool(value: boolean | null) {
      if (value === null) {
        return;
      }

      this.StartNewObject(false);
      this._addToCurrentObject(value);
    }

    public WriteInt(value: number | null) {
      if (value === null) {
        return;
      }

      this.StartNewObject(false);

      this._addToCurrentObject(Math.floor(value));
    }

    public WriteFloat(value: number | null) {
      if (value === null) {
        return;
      }

      this.StartNewObject(false);
      if (value == Number.POSITIVE_INFINITY) {
        this._addToCurrentObject("inff");
      } else if (value == Number.NEGATIVE_INFINITY) {
        this._addToCurrentObject("-inff");
      } else if (isNaN(value)) {
        this._addToCurrentObject("nanf");
      } else if (Number.isInteger(value)) {
        const repr = value.toString();
        this._addToCurrentObject(
          repr.includes("e") ? `${repr}f` : `${repr}.0f`,
        );
      } else {
        this._addToCurrentObject(value);
      }
    }

    public WriteNull() {
      this.StartNewObject(false);
      this._addToCurrentObject(null);
    }

    public WriteInjected(value: any) {
      this.StartNewObject(false);
      this._addToCurrentObject(value);
    }

    public WriteStringStart() {
      this.StartNewObject(false);
      this._currentString = "";
      this._pushState(SimpleJson.Writer.State.String);
    }

    public WriteStringEnd() {
      this.Assert(this.state == SimpleJson.Writer.State.String);
      this._popState();
      this._addToCurrentObject(this._currentString);
      this._currentString = null;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public WriteStringInner(str: string | null, _escape: boolean = true) {
      this.Assert(this.state === SimpleJson.Writer.State.String);

      if (str === null) {
        console.error("Warning: trying to write a null string");
        return;
      }

      this._currentString += str;
    }

    public toString() {
      if (this._jsonObject === null) {
        return "";
      }

      return JSON.stringify(this._jsonObject);
    }

    public toObject() {
      return this._jsonObject;
    }

    private StartNewObject(container: boolean) {
      if (container) {
        this.Assert(
          this.state === SimpleJson.Writer.State.None ||
            this.state === SimpleJson.Writer.State.Property ||
            this.state === SimpleJson.Writer.State.Array,
        );
      } else {
        this.Assert(
          this.state === SimpleJson.Writer.State.Property ||
            this.state === SimpleJson.Writer.State.Array,
        );
      }

      if (this.state === SimpleJson.Writer.State.Property) {
        this.Assert(this.childCount === 0);
      }

      if (
        this.state === SimpleJson.Writer.State.Array ||
        this.state === SimpleJson.Writer.State.Property
      ) {
        this.IncrementChildCount();
      }
    }

    private _pushState(type: SimpleJson.Writer.State) {
      this._stateTypeStack.push(type);
      this._stateChildCountStack.push(0);
    }

    private _popState() {
      this._stateTypeStack.pop();
      this._stateChildCountStack.pop();
    }

    private get state() {
      const len = this._stateTypeStack.length;
      if (len > 0) {
        return this._stateTypeStack[len - 1];
      } else {
        return SimpleJson.Writer.State.None;
      }
    }

    private get childCount() {
      const len = this._stateChildCountStack.length;
      if (len > 0) {
        return this._stateChildCountStack[len - 1];
      } else {
        return 0;
      }
    }

    private get currentCollection(): Record<string, any> | null {
      if (this._collectionStack.length > 0) {
        return this._collectionStack[this._collectionStack.length - 1]!;
      } else {
        return null;
      }
    }

    private get currentPropertyName() {
      if (this._propertyNameStack.length > 0) {
        return this._propertyNameStack[this._propertyNameStack.length - 1];
      } else {
        return null;
      }
    }

    private IncrementChildCount() {
      const len = this._stateChildCountStack.length;
      this.Assert(len > 0);
      this._stateChildCountStack[len - 1]!++;
    }

    private Assert(condition: boolean) {
      if (!condition) throw Error("Assert failed while writing JSON");
    }

    private _addToCurrentObject(value: number | string | boolean | null) {
      this.Assert(this.currentCollection !== null);
      if (this.state === SimpleJson.Writer.State.Array) {
        this.Assert(Array.isArray(this.currentCollection));
        (this.currentCollection as any[]).push(value);
      } else if (this.state === SimpleJson.Writer.State.Property) {
        this.Assert(!Array.isArray(this.currentCollection));
        this.Assert(this.currentPropertyName !== null);
        (this.currentCollection as Record<string, any>)[
          this.currentPropertyName!
        ] = value;
        this._propertyNameStack.pop();
      }
    }

    private _currentPropertyName: string | null = null;

    private _currentString: string | null = null;

    private _stateTypeStack: SimpleJson.Writer.State[] = [];
    private _stateChildCountStack: number[] = [];

    private _collectionStack: Array<any[] | Record<string, any>> = [];

    private _propertyNameStack: string[] = [];

    private _jsonObject: Record<string, any> | null = null;
  }

  export namespace Writer {
    export enum State {
      None,
      Object,
      Array,
      Property,
      PropertyName,
      String,
    }
  }
}
