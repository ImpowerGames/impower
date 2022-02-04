// In C#, this class writes json tokens directly to a StringWriter or
// another stream. Here, a temporary hierarchy is created in the form
// of a javascript object, which is serialised in the `toString` method.

import { JsonWriterState } from "../types/JsonWriterState";
import { JsonWriterStateElement } from "./JsonWriterStateElement";

// See individual methods and properties for more information.
export class JsonWriter {
  public WriteObject(inner: (w: JsonWriter) => void): void {
    this.WriteObjectStart();
    inner(this);
    this.WriteObjectEnd();
  }

  // Add a new object.
  public WriteObjectStart(): void {
    this.StartNewObject(true);

    const newObject: Record<string, unknown> = {};

    if (this.state === "Property") {
      // This object is created as the value of a property,
      // inside an other object.
      this.Assert(this.currentCollection !== null);
      this.Assert(this.currentPropertyName !== null);

      const propertyName = this._propertyNameStack.pop();
      this.currentCollection[propertyName] = newObject;
      this._collectionStack.push(newObject);
    } else if (
      this.state === "Array" &&
      Array.isArray(this.currentCollection)
    ) {
      // This object is created as the child of an array.
      this.Assert(this.currentCollection !== null);

      this.currentCollection.push(newObject);
      this._collectionStack.push(newObject);
    } else {
      // This object is the root object.
      this.Assert(this.state === "None");
      this._jsonObject = newObject;
      this._collectionStack.push(newObject);
    }

    this._stateStack.push(new JsonWriterStateElement("Object"));
  }

  public WriteObjectEnd(): void {
    this.Assert(this.state === "Object");
    this._collectionStack.pop();
    this._stateStack.pop();
  }

  // Write a property name / value pair to the current object.
  public WriteProperty(
    name: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    innerOrContent: ((w: JsonWriter) => void) | string | boolean
  ): void {
    this.WritePropertyStart(name);
    if (innerOrContent instanceof Function) {
      const inner = innerOrContent;
      inner(this);
    } else {
      const content: string | boolean = innerOrContent;
      this.Write(content);
    }
    this.WritePropertyEnd();
  }

  // Int and Float are separate calls, since there both are
  // numbers in JavaScript, but need to be handled differently.

  public WriteIntProperty(name: string, content: number): void {
    this.WritePropertyStart(name);
    this.WriteInt(content);
    this.WritePropertyEnd();
  }

  public WriteFloatProperty(name: string, content: number): void {
    this.WritePropertyStart(name);
    this.WriteFloat(content);
    this.WritePropertyEnd();
  }

  // Prepare a new property name, which will be use to add the
  // new object when calling _addToCurrentObject() from a Write
  // method.
  public WritePropertyStart(name: string): void {
    this.Assert(this.state === "Object");
    this._propertyNameStack.push(name);

    this.IncrementChildCount();

    this._stateStack.push(new JsonWriterStateElement("Property"));
  }

  public WritePropertyEnd(): void {
    this.Assert(this.state === "Property");
    this.Assert(this.childCount === 1);
    this._stateStack.pop();
  }

  // Prepare a new property name, except this time, the property name
  // will be created by concatenating all the strings passed to
  // WritePropertyNameInner.
  public WritePropertyNameStart(): void {
    this.Assert(this.state === "Object");
    this.IncrementChildCount();

    this._currentPropertyName = "";

    this._stateStack.push(new JsonWriterStateElement("Property"));
    this._stateStack.push(new JsonWriterStateElement("PropertyName"));
  }

  public WritePropertyNameEnd(): void {
    this.Assert(this.state === "PropertyName");
    this.Assert(this._currentPropertyName !== null);
    this._propertyNameStack.push(this._currentPropertyName);
    this._currentPropertyName = null;
    this._stateStack.pop();
  }

  public WritePropertyNameInner(str: string): void {
    this.Assert(this.state === "PropertyName");
    this.Assert(this._currentPropertyName !== null);
    this._currentPropertyName += str;
  }

  // Add a new array.
  public WriteArrayStart(): void {
    this.StartNewObject(true);

    const newObject: unknown[] = [];

    if (this.state === "Property") {
      // This array is created as the value of a property,
      // inside an object.
      this.Assert(this.currentCollection !== null);
      this.Assert(this.currentPropertyName !== null);

      const propertyName = this._propertyNameStack.pop();
      this.currentCollection[propertyName] = newObject;
      this._collectionStack.push(newObject);
    } else if (
      this.state === "Array" &&
      Array.isArray(this.currentCollection)
    ) {
      // This array is created as the child of another array.
      this.Assert(this.currentCollection !== null);

      this.currentCollection.push(newObject);
      this._collectionStack.push(newObject);
    } else {
      // This array is the root object.
      this.Assert(this.state === "None");
      this._jsonObject = newObject;
      this._collectionStack.push(newObject);
    }

    this._stateStack.push(new JsonWriterStateElement("Array"));
  }

  public WriteArrayEnd(): void {
    this.Assert(this.state === "Array");
    this._collectionStack.pop();
    this._stateStack.pop();
  }

  // Add the value to the appropriate collection (array / object), given the current
  // context.
  public Write(
    value: number | string | boolean,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    escape = true
  ): void {
    if (value === null) {
      console.error("Warning: trying to write a null string");
      return;
    }

    this.StartNewObject(false);
    this._addToCurrentObject(value);
  }

  public WriteBool(value: boolean): void {
    if (value === null) {
      return;
    }

    this.StartNewObject(false);
    this._addToCurrentObject(value);
  }

  public WriteInt(value: number): void {
    if (value === null) {
      return;
    }

    this.StartNewObject(false);

    // Math.floor is used as a precaution:
    //     1. to ensure that the value is written as an integer
    //        (without a fractional part -> 1 instead of 1.0), even
    //        though it should be the default behaviour of
    //        JSON.serialize;
    //     2. to ensure that if a floating number is passed
    //        accidentally, it's converted to an integer.
    //
    // This guarantees savegame compatibility with the reference
    // implementation.
    this._addToCurrentObject(Math.floor(value));
  }

  // Since JSON doesn't support NaN and Infinity, these values
  // are converted here.
  public WriteFloat(value: number): void {
    if (value === null) {
      return;
    }

    this.StartNewObject(false);
    if (value === Number.POSITIVE_INFINITY) {
      this._addToCurrentObject(3.4e38);
    } else if (value === Number.NEGATIVE_INFINITY) {
      this._addToCurrentObject(-3.4e38);
    } else if (Number.isNaN(value)) {
      this._addToCurrentObject(0.0);
    } else {
      this._addToCurrentObject(value);
    }
  }

  public WriteNull(): void {
    this.StartNewObject(false);
    this._addToCurrentObject(null);
  }

  // Prepare a string before adding it to the current collection in
  // WriteStringEnd(). The string will be a concatenation of all the
  // strings passed to WriteStringInner.
  public WriteStringStart(): void {
    this.StartNewObject(false);
    this._currentString = "";
    this._stateStack.push(new JsonWriterStateElement("String"));
  }

  public WriteStringEnd(): void {
    this.Assert(this.state === "String");
    this._stateStack.pop();
    this._addToCurrentObject(this._currentString);
    this._currentString = null;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public WriteStringInner(str: string, escape = true): void {
    this.Assert(this.state === "String");

    if (str === null) {
      console.error("Warning: trying to write a null string");
      return;
    }

    this._currentString += str;
  }

  // Serialise the root object into a JSON string.
  public ToString(): string {
    if (this._jsonObject === null) {
      return "";
    }

    return JSON.stringify(this._jsonObject);
  }

  // Prepare the state stack when adding new objects / values.
  private StartNewObject(container: boolean): void {
    if (container) {
      this.Assert(
        this.state === "None" ||
          this.state === "Property" ||
          this.state === "Array"
      );
    } else {
      this.Assert(this.state === "Property" || this.state === "Array");
    }

    if (this.state === "Property") {
      this.Assert(this.childCount === 0);
    }

    if (this.state === "Array" || this.state === "Property") {
      this.IncrementChildCount();
    }
  }

  // These getters peek all the different stacks.

  private get state(): JsonWriterState {
    if (this._stateStack.length > 0) {
      return this._stateStack[this._stateStack.length - 1].type;
    }
    return "None";
  }

  private get childCount(): number {
    if (this._stateStack.length > 0) {
      return this._stateStack[this._stateStack.length - 1].childCount;
    }
    return 0;
  }

  private get currentCollection(): unknown[] | Record<string, unknown> {
    if (this._collectionStack.length > 0) {
      return this._collectionStack[this._collectionStack.length - 1];
    }
    return null;
  }

  private get currentPropertyName(): string {
    if (this._propertyNameStack.length > 0) {
      return this._propertyNameStack[this._propertyNameStack.length - 1];
    }
    return null;
  }

  private IncrementChildCount(): void {
    this.Assert(this._stateStack.length > 0);
    const currEl = this._stateStack.pop();
    currEl.childCount += 1;
    this._stateStack.push(currEl);
  }

  private Assert(condition: boolean): void {
    if (!condition) {
      throw Error("Assert failed while writing JSON");
    }
  }

  // This method did not exist in the original C# code. It adds
  // the given value to the current collection (used by Write methods).
  private _addToCurrentObject(value: number | string | boolean): void {
    this.Assert(this.currentCollection !== null);
    if (this.state === "Array") {
      this.Assert(Array.isArray(this.currentCollection));
      (this.currentCollection as unknown[]).push(value);
    } else if (this.state === "Property") {
      this.Assert(!Array.isArray(this.currentCollection));
      this.Assert(this.currentPropertyName !== null);
      (this.currentCollection as Record<string, unknown>)[
        this.currentPropertyName
      ] = value;
      this._propertyNameStack.pop();
    }
  }

  // In addition to `_stateStack` present in the original code,
  // this implementation of SimpleJson use two other stacks and two
  // temporary variables holding the current context.

  // Used to keep track of the current property name being built
  // with `WritePropertyNameStart`, `WritePropertyNameInner` and
  // `WritePropertyNameEnd`.
  private _currentPropertyName: string = null;

  // Used to keep track of the current string value being built
  // with `WriteStringStart`, `WriteStringInner` and
  // `WriteStringEnd`.
  private _currentString: string = null;

  private _stateStack: JsonWriterStateElement[] = [];

  // Keep track of the current collection being built (either an array
  // or an object). For instance, at the '?' step during the hiarchy
  // creation, this hierarchy:
  // [3, {a: [b, ?]}] will have this corresponding stack:
  // (bottom) [Array, Object, Array] (top)
  private _collectionStack: Array<unknown[] | Record<string, unknown>> = [];

  // Keep track of the current property being assigned. For instance, at
  // the '?' step during the hiarchy creation, this hierarchy:
  // [3, {a: [b, {c: ?}]}] will have this corresponding stack:
  // (bottom) [a, c] (top)
  private _propertyNameStack: string[] = [];

  // Object containing the entire hiearchy.
  private _jsonObject: Record<string, unknown> | unknown[] = null;
}
