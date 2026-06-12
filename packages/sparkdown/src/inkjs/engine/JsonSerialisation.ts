import { Container } from "./Container";
import {
  Value,
  IntValue,
  FloatValue,
  StringValue,
  DivertTargetValue,
  VariablePointerValue,
  ListValue,
  BoolValue,
  NullValue,
  ObjectValue,
  AbstractValue,
} from "./Value";
import { Glue } from "./Glue";
import { ControlCommand } from "./ControlCommand";
import { PushPopType } from "./PushPop";
import { Divert } from "./Divert";
import { ChoicePoint } from "./ChoicePoint";
import { VariableReference } from "./VariableReference";
import { VariableAssignment } from "./VariableAssignment";
import { NativeFunctionCall } from "./NativeFunctionCall";
import { Void } from "./Void";
import { Tag } from "./Tag";
import { Path } from "./Path";
import { Choice } from "./Choice";
import { ListDefinition } from "./ListDefinition";
import { ListDefinitionsOrigin } from "./ListDefinitionsOrigin";
import { InkListItem, InkList } from "./InkList";
import { InkObject } from "./Object";
import { asOrNull } from "./TypeAssertion";
import { throwNullException } from "./NullException";
import { SimpleJson } from "./SimpleJson";

export class JsonSerialisation {
  public static JArrayToRuntimeObjList(
    jArray: any[],
    skipLast: boolean = false,
  ) {
    let count = jArray.length;
    if (skipLast) count--;

    let list: InkObject[] = [];

    for (let i = 0; i < count; i++) {
      let jTok = jArray[i];
      let runtimeObj = this.JTokenToRuntimeObject(jTok);
      if (runtimeObj === null) {
        return throwNullException("runtimeObj");
      }
      list.push(runtimeObj);
    }

    return list;
  }

  public static WriteDictionaryRuntimeObjs(
    writer: SimpleJson.Writer,
    dictionary: Map<string, InkObject>,
  ) {
    writer.WriteObjectStart();
    for (let [key, value] of dictionary) {
      writer.WritePropertyStart(key);
      this.WriteRuntimeObject(writer, value);
      writer.WritePropertyEnd();
    }
    writer.WriteObjectEnd();
  }

  public static WriteListRuntimeObjs(
    writer: SimpleJson.Writer,
    list: InkObject[],
  ) {
    writer.WriteArrayStart();
    for (let value of list) {
      this.WriteRuntimeObject(writer, value);
    }
    writer.WriteArrayEnd();
  }

  public static WriteIntDictionary(
    writer: SimpleJson.Writer,
    dict: Map<string, number>,
  ) {
    writer.WriteObjectStart();
    for (let [key, value] of dict) {
      writer.WriteIntProperty(key, value);
    }
    writer.WriteObjectEnd();
  }

  public static WriteRuntimeObject(
    writer: SimpleJson.Writer,
    obj: InkObject,
    onWriteRuntimeObject?: (
      writer: SimpleJson.Writer,
      obj: InkObject,
    ) => boolean,
  ): void {
    let container = asOrNull(obj, Container);
    if (container) {
      this.WriteRuntimeContainer(
        writer,
        container,
        false,
        onWriteRuntimeObject,
      );
      return;
    }

    if (onWriteRuntimeObject && onWriteRuntimeObject(writer, obj)) {
      return;
    }

    let divert = asOrNull(obj, Divert);
    if (divert) {
      let divTypeKey = "->";
      if (divert.isExternal) {
        divTypeKey = "x()";
      } else if (divert.pushesToStack) {
        if (divert.stackPushType == PushPopType.Function) {
          divTypeKey = "f()";
        } else if (divert.stackPushType == PushPopType.Tunnel) {
          divTypeKey = "->t->";
        }
      }

      let targetStr;
      if (divert.hasVariableTarget) {
        targetStr = divert.variableDivertName;
      } else {
        targetStr = divert.targetPathString;
      }

      writer.WriteObjectStart();
      writer.WriteProperty(divTypeKey, targetStr);

      if (divert.hasVariableTarget) {
        writer.WriteProperty("var", true);
      }

      if (divert.isConditional) {
        writer.WriteProperty("c", true);
      }

      if (divert.externalArgs > 0) {
        writer.WriteIntProperty("exArgs", divert.externalArgs);
      }

      writer.WriteObjectEnd();
      return;
    }

    let choicePoint = asOrNull(obj, ChoicePoint);
    if (choicePoint) {
      writer.WriteObjectStart();
      writer.WriteProperty("*", choicePoint.pathStringOnChoice);
      writer.WriteIntProperty("flg", choicePoint.flags);
      writer.WriteObjectEnd();
      return;
    }

    let nullVal = asOrNull(obj, NullValue);
    if (nullVal) {
      // Serialize Lua `nil` as the literal token `"nil"` — mirrors
      // the way `Void` writes itself as `"void"`. Reader picks this
      // up in the string-token branch below.
      writer.Write("nil");
      return;
    }

    let boolVal = asOrNull(obj, BoolValue);
    if (boolVal) {
      writer.WriteBool(boolVal.value);
      return;
    }

    let intVal = asOrNull(obj, IntValue);
    if (intVal) {
      writer.WriteInt(intVal.value);
      return;
    }

    let floatVal = asOrNull(obj, FloatValue);
    if (floatVal) {
      writer.WriteFloat(floatVal.value);
      return;
    }

    let strVal = asOrNull(obj, StringValue);
    if (strVal) {
      if (strVal.isNewline) {
        writer.Write("\n", false);
      } else {
        writer.WriteStringStart();
        writer.WriteStringInner("^");
        writer.WriteStringInner(strVal.value);
        writer.WriteStringEnd();
      }
      return;
    }

    let listVal = asOrNull(obj, ListValue);
    if (listVal) {
      this.WriteInkList(writer, listVal);
      return;
    }

    let objVal = asOrNull(obj, ObjectValue);
    if (objVal) {
      writer.WriteObjectStart();
      writer.WritePropertyStart("obj");
      writer.WriteObjectStart();
      if (objVal.value !== null) {
        for (const [k, v] of objVal.value) {
          writer.WritePropertyStart(k);
          if (v) {
            this.WriteRuntimeObject(writer, v);
          } else {
            writer.WriteNull();
          }
          writer.WritePropertyEnd();
        }
      }
      writer.WriteObjectEnd();
      writer.WritePropertyEnd();
      // Metatable round-trip — only emit the slot when one is set, so
      // existing tables without metatables stay compact in the wire
      // format. Recursive write since metatables are themselves
      // ObjectValues (and can in turn carry their own metatables, e.g.
      // class inheritance chains).
      if (objVal.metatable) {
        writer.WritePropertyStart("mt");
        this.WriteRuntimeObject(writer, objVal.metatable);
        writer.WritePropertyEnd();
      }
      writer.WriteObjectEnd();
      return;
    }

    let divTargetVal = asOrNull(obj, DivertTargetValue);
    if (divTargetVal) {
      writer.WriteObjectStart();
      if (divTargetVal.value === null) {
        return throwNullException("divTargetVal.value");
      }
      writer.WriteProperty("^->", divTargetVal.value.componentsString);
      writer.WriteObjectEnd();

      return;
    }

    let varPtrVal = asOrNull(obj, VariablePointerValue);
    if (varPtrVal) {
      writer.WriteObjectStart();
      writer.WriteProperty("^var", varPtrVal.value);
      writer.WriteIntProperty("ci", varPtrVal.contextIndex);
      writer.WriteObjectEnd();
      return;
    }

    let glue = asOrNull(obj, Glue);
    if (glue) {
      writer.Write("<>");
      return;
    }

    let controlCmd = asOrNull(obj, ControlCommand);
    if (controlCmd) {
      // Data-carrying generic dispatcher: encode the function name
      // and arity into the token so the deserializer can reconstruct
      // the call site. Format: `stdlib:<name>:<arity>`. Function
      // names are alphanumeric + dot (e.g. `assert`, `plural.category`)
      // so a colon separator is unambiguous.
      if (
        controlCmd.commandType ===
        ControlCommand.CommandType.RunStdLibFunction
      ) {
        writer.Write(
          `stdlib:${controlCmd._stdLibName}:${controlCmd._stdLibArity}`,
        );
        return;
      }
      // Multi-return tuple pack/unpack. Encode the arity into the
      // token so the deserializer can reconstruct it.
      if (
        controlCmd.commandType === ControlCommand.CommandType.PackTuple
      ) {
        writer.Write(`pack:${controlCmd._tupleArity}`);
        return;
      }
      if (
        controlCmd.commandType === ControlCommand.CommandType.UnpackTuple
      ) {
        writer.Write(`unpack:${controlCmd._tupleArity}`);
        return;
      }
      // Lua `and`/`or` short-circuit jump: `sc:<op>:<skipCount>`.
      if (
        controlCmd.commandType === ControlCommand.CommandType.ShortCircuit
      ) {
        writer.Write(
          `sc:${controlCmd._shortCircuitOp}:${controlCmd._shortCircuitSkipCount}`,
        );
        return;
      }
      // `CallValueAsFunction(n)` — encode the call-site arg count so
      // the runtime closure dispatch can pad missing args with nil.
      // Untracked sites encode plainly as `func()` (preserves legacy
      // serialization) and the runtime falls back to its old behaviour.
      if (
        controlCmd.commandType ===
          ControlCommand.CommandType.CallValueAsFunction &&
        controlCmd._callValueArgCount >= 0
      ) {
        writer.Write(`func(${controlCmd._callValueArgCount})`);
        return;
      }
      writer.Write(
        JsonSerialisation._controlCommandNames[controlCmd.commandType]!,
      );
      return;
    }

    let nativeFunc = asOrNull(obj, NativeFunctionCall);
    if (nativeFunc) {
      let name = nativeFunc.name;

      if (name == "^") name = "L^";

      // Variadic natives (the `__method_*` builtin-method family) need
      // the call-site arg count preserved through serialization — their
      // prototype's `numberOfParameters` is -1, so the deserialized
      // call would otherwise pop zero args off the eval stack. Encode
      // the actual arity as a `@<n>` suffix; the deserializer parses
      // it back and restores it on the instance.
      if (nativeFunc.isVariadic) {
        name = `${name}@${nativeFunc.numberOfParameters}`;
      }

      writer.Write(name);
      return;
    }

    let varRef = asOrNull(obj, VariableReference);
    if (varRef) {
      writer.WriteObjectStart();
      let readCountPath = varRef.pathStringForCount;
      if (readCountPath != null) {
        writer.WriteProperty("CNT?", readCountPath);
      } else {
        writer.WriteProperty("VAR?", varRef.name);
      }

      writer.WriteObjectEnd();
      return;
    }

    let varAss = asOrNull(obj, VariableAssignment);
    if (varAss) {
      writer.WriteObjectStart();

      let key = varAss.isGlobal ? "VAR=" : "temp=";
      writer.WriteProperty(key, varAss.variableName);

      // Reassignment?
      if (!varAss.isNewDeclaration) writer.WriteProperty("re", true);
      // Varargs slot — runtime skips MultiValue → first-value
      // unwrapping for this binding so `__varargs__` keeps the
      // packed tuple intact. Serialized as `va: true` to survive
      // JSON round-trip when running pre-compiled stories.
      if (varAss.isVarargsSlot) writer.WriteProperty("va", true);

      writer.WriteObjectEnd();

      return;
    }

    let voidObj = asOrNull(obj, Void);
    if (voidObj) {
      writer.Write("void");
      return;
    }

    let tag = asOrNull(obj, Tag);
    if (tag) {
      writer.WriteObjectStart();
      writer.WriteProperty("#", tag.text);
      writer.WriteObjectEnd();
      return;
    }

    let choice = asOrNull(obj, Choice);
    if (choice) {
      this.WriteChoice(writer, choice);
      return;
    }

    throw new Error("Failed to convert runtime object to Json token: " + obj);
  }

  public static JObjectToDictionaryRuntimeObjs(jObject: Record<string, any>) {
    let dict: Map<string, InkObject> = new Map();

    for (let key in jObject) {
      if (jObject.hasOwnProperty(key)) {
        let inkObject = this.JTokenToRuntimeObject(jObject[key]);
        if (inkObject === null) {
          return throwNullException("inkObject");
        }
        dict.set(key, inkObject);
      }
    }

    return dict;
  }

  public static JObjectToIntDictionary(jObject: Record<string, any>) {
    let dict: Map<string, number> = new Map();
    for (let key in jObject) {
      if (jObject.hasOwnProperty(key)) {
        dict.set(key, parseInt(jObject[key]));
      }
    }
    return dict;
  }

  public static JTokenToRuntimeObject(token: any): InkObject | null {
    if (
      (typeof token === "number" && !isNaN(token)) ||
      typeof token === "boolean"
    ) {
      return Value.Create(token);
    }

    if (typeof token === "string") {
      let str = token.toString();

      // Explicit float value: "123.00f", plus exponent forms like
      // "3.4e+38f" (large integral floats stringify with an exponent,
      // so the writer appends a bare `f` there — see
      // SimpleJson.WriteFloat).
      const floatRepresentation =
        /^(-?[0-9]+(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?f)$/.exec(str);
      if (floatRepresentation) {
        return new FloatValue(parseFloat(floatRepresentation[0]));
      }

      // Non-finite floats — JSON can't carry Infinity/NaN, so the
      // writer (SimpleJson.WriteFloat) emits these string markers.
      // Required for Lua semantics: `math.huge` compiles to a real
      // Infinity constant and `0/0` results must stay NaN through
      // the story-JSON round trip (clamping them to 3.4e38 / 0 broke
      // basic.luau's fp-special fixtures).
      if (str === "inff") return new FloatValue(Infinity);
      if (str === "-inff") return new FloatValue(-Infinity);
      if (str === "nanf") return new FloatValue(NaN);

      // String value
      let firstChar = str[0];
      if (firstChar == "^") return new StringValue(str.substring(1));
      else if (firstChar == "\n" && str.length == 1)
        return new StringValue("\n");

      // Glue
      if (str == "<>") return new Glue();

      // Generic stdlib dispatcher: encoded as `stdlib:<name>:<arity>`.
      // Mirror of the writer above. Function names may contain dots
      // (e.g. `plural.category`), so split on the LAST colon to pull
      // arity off the end and treat everything before as the name.
      if (str.startsWith("stdlib:")) {
        const lastColon = str.lastIndexOf(":");
        if (lastColon > "stdlib:".length - 1) {
          const arityRaw = str.slice(lastColon + 1);
          const arity = parseInt(arityRaw, 10);
          if (Number.isFinite(arity)) {
            const name = str.slice("stdlib:".length, lastColon);
            return ControlCommand.RunStdLib(name, arity);
          }
        }
      }

      // Multi-return tuple pack/unpack: `pack:<n>` / `unpack:<n>`.
      if (str.startsWith("pack:")) {
        const arity = parseInt(str.slice("pack:".length), 10);
        if (Number.isFinite(arity)) return ControlCommand.PackTuple(arity);
      }
      if (str.startsWith("unpack:")) {
        const arity = parseInt(str.slice("unpack:".length), 10);
        if (Number.isFinite(arity)) return ControlCommand.UnpackTuple(arity);
      }

      // Conditional content-pointer jump: `sc:<op>:<skipCount>`.
      // Ops: `and`/`or` (Lua short-circuit), `if`/`jump` (ternary
      // if-then-else expression arms).
      if (str.startsWith("sc:")) {
        const lastColon = str.lastIndexOf(":");
        if (lastColon > "sc:".length - 1) {
          const skip = parseInt(str.slice(lastColon + 1), 10);
          const op = str.slice("sc:".length, lastColon);
          if (
            Number.isFinite(skip) &&
            (op === "and" || op === "or" || op === "if" || op === "jump")
          ) {
            return ControlCommand.ShortCircuit(op, skip);
          }
        }
      }

      // `func(N)` — CallValueAsFunction with explicit call-site arg
      // count. Round-trip of `CallValueAsFunction(N)` (see serializer).
      // Bare `CallValueAsFunction` (no count) falls through to the
      // generic control-command-names match below.
      if (str.startsWith("func(") && str.endsWith(")")) {
        const arity = parseInt(str.slice("func(".length, str.length - 1), 10);
        if (Number.isFinite(arity)) {
          return ControlCommand.CallValueAsFunction(arity);
        }
      }

      // Control commands (would looking up in a hash set be faster?)
      for (let i = 0; i < JsonSerialisation._controlCommandNames.length; ++i) {
        let cmdName = JsonSerialisation._controlCommandNames[i];
        if (str == cmdName) {
          return new ControlCommand(i);
        }
      }

      // Native functions
      if (str == "L^") str = "^";
      // Variadic natives are serialized as `name@arity` (see serializer
      // above for the rationale). Parse the suffix back into the
      // call-site arity so the runtime knows how many params to pop.
      const at = str.lastIndexOf("@");
      if (at > 0) {
        const bareName = str.slice(0, at);
        const arityRaw = str.slice(at + 1);
        if (/^\d+$/.test(arityRaw) && NativeFunctionCall.CallExistsWithName(bareName)) {
          return NativeFunctionCall.CallWithName(bareName, parseInt(arityRaw, 10));
        }
      }
      if (NativeFunctionCall.CallExistsWithName(str))
        return NativeFunctionCall.CallWithName(str);

      // Pop
      if (str == "->->") return ControlCommand.PopTunnel();
      else if (str == "~ret") return ControlCommand.PopFunction();

      // Void
      if (str == "void") return new Void();

      // Lua `nil` — see write path for the matching literal token.
      if (str == "nil") return new NullValue();
    }

    if (typeof token === "object" && !Array.isArray(token)) {
      let obj = token as Record<string, any>;
      let propValue;

      // Divert target value to path
      if (obj["^->"]) {
        propValue = obj["^->"];
        return new DivertTargetValue(new Path(propValue.toString()));
      }

      // VariablePointerValue
      if (obj["^var"]) {
        propValue = obj["^var"];
        let varPtr = new VariablePointerValue(propValue.toString());
        if ("ci" in obj) {
          propValue = obj["ci"];
          varPtr.contextIndex = parseInt(propValue);
        }
        return varPtr;
      }

      // Divert
      let isDivert = false;
      let pushesToStack = false;
      let divPushType = PushPopType.Function;
      let external = false;
      if ((propValue = obj["->"])) {
        isDivert = true;
      } else if ((propValue = obj["f()"])) {
        isDivert = true;
        pushesToStack = true;
        divPushType = PushPopType.Function;
      } else if ((propValue = obj["->t->"])) {
        isDivert = true;
        pushesToStack = true;
        divPushType = PushPopType.Tunnel;
      } else if ((propValue = obj["x()"])) {
        isDivert = true;
        external = true;
        pushesToStack = false;
        divPushType = PushPopType.Function;
      }

      if (isDivert) {
        let divert = new Divert();
        divert.pushesToStack = pushesToStack;
        divert.stackPushType = divPushType;
        divert.isExternal = external;

        let target = propValue.toString();

        if ((propValue = obj["var"])) divert.variableDivertName = target;
        else divert.targetPathString = target;

        divert.isConditional = !!obj["c"];

        if (external) {
          if ((propValue = obj["exArgs"]))
            divert.externalArgs = parseInt(propValue);
        }

        return divert;
      }

      // Choice
      if ((propValue = obj["*"])) {
        let choice = new ChoicePoint();
        choice.pathStringOnChoice = propValue.toString();

        if ((propValue = obj["flg"])) choice.flags = parseInt(propValue);

        return choice;
      }

      // Variable reference
      if ((propValue = obj["VAR?"])) {
        return new VariableReference(propValue.toString());
      } else if ((propValue = obj["CNT?"])) {
        let readCountVarRef = new VariableReference();
        readCountVarRef.pathStringForCount = propValue.toString();
        return readCountVarRef;
      }

      // Variable assignment
      let isVarAss = false;
      let isGlobalVar = false;
      if ((propValue = obj["VAR="])) {
        isVarAss = true;
        isGlobalVar = true;
      } else if ((propValue = obj["temp="])) {
        isVarAss = true;
        isGlobalVar = false;
      }
      if (isVarAss) {
        let varName = propValue.toString();
        let isNewDecl = !obj["re"];
        let isVarargsSlot = !!obj["va"];
        let varAss = new VariableAssignment(varName, isNewDecl, isVarargsSlot);
        varAss.isGlobal = isGlobalVar;
        return varAss;
      }
      if (obj["#"] !== undefined) {
        propValue = obj["#"];
        return new Tag(propValue.toString());
      }

      // List value
      if ((propValue = obj["list"])) {
        // var listContent = (Dictionary<string, object>)propValue;
        let listContent = propValue as Record<string, any>;
        let rawList = new InkList();
        if ((propValue = obj["origins"])) {
          // var namesAsObjs = (List<object>)propValue;
          let namesAsObjs = propValue as string[];
          // rawList.SetInitialOriginNames(namesAsObjs.Cast<string>().ToList());
          rawList.SetInitialOriginNames(namesAsObjs);
        }

        for (let key in listContent) {
          if (listContent.hasOwnProperty(key)) {
            let nameToVal = listContent[key];
            let item = new InkListItem(key);
            let val = parseInt(nameToVal);
            rawList.Add(item, val);
          }
        }

        return new ListValue(rawList);
      }

      // Object value
      if (obj["obj"] !== undefined) {
        const objContent = obj["obj"] as Record<string, any>;
        const entries = new Map<string, AbstractValue>();
        for (const key in objContent) {
          if (!Object.prototype.hasOwnProperty.call(objContent, key)) continue;
          const child = this.JTokenToRuntimeObject(objContent[key]);
          const childVal = asOrNull(child, AbstractValue);
          if (childVal) entries.set(key, childVal);
        }
        const result = new ObjectValue(entries);
        // Restore the metatable if the writer emitted one. The slot
        // is itself an ObjectValue, so we recurse through the same
        // entry point — its own `mt` is restored too if present.
        if (obj["mt"] !== undefined) {
          const mtParsed = this.JTokenToRuntimeObject(obj["mt"]);
          const mt = asOrNull(mtParsed, ObjectValue);
          if (mt) result.metatable = mt;
        }
        return result;
      }

      if (obj["originalChoicePath"] != null) return this.JObjectToChoice(obj);
    }

    // Array is always a Runtime.Container
    if (Array.isArray(token)) {
      return this.JArrayToContainer(token);
    }

    if (token === null || token === undefined) return null;

    // MADE JSON SERIALIZATION MORE ERROR TOLERANT
    // throw new Error(
    //   "Failed to convert token to runtime object: " +
    //     this.toJson(token, ["parent"])
    // );
  }

  public static toJson<T>(
    me: T,
    removes?: (keyof T)[],
    space?: number,
  ): string {
    return JSON.stringify(
      me,
      (k, v) => (removes?.some((r) => r === k) ? undefined : v),
      space,
    );
  }

  public static WriteRuntimeContainer(
    writer: SimpleJson.Writer,
    container: Container | null,
    withoutName: boolean = false,
    onWriteRuntimeObject?: (
      writer: SimpleJson.Writer,
      obj: InkObject,
    ) => boolean,
  ) {
    writer.WriteArrayStart();
    if (container === null) {
      return throwNullException("container");
    }
    for (let c of container.content)
      this.WriteRuntimeObject(writer, c, onWriteRuntimeObject);

    let namedOnlyContent = container.namedOnlyContent;
    let countFlags = container.countFlags;
    let hasNameProperty = container.name != null && !withoutName;

    let hasTerminator =
      namedOnlyContent != null || countFlags > 0 || hasNameProperty;
    if (hasTerminator) {
      writer.WriteObjectStart();
    }

    if (namedOnlyContent != null) {
      for (let [key, value] of namedOnlyContent) {
        let name = key;
        let namedContainer = asOrNull(value, Container);
        writer.WritePropertyStart(name);
        this.WriteRuntimeContainer(
          writer,
          namedContainer,
          true,
          onWriteRuntimeObject,
        );
        writer.WritePropertyEnd();
      }
    }

    if (countFlags > 0) writer.WriteIntProperty("#f", countFlags);

    if (hasNameProperty) writer.WriteProperty("#n", container.name);

    if (hasTerminator) writer.WriteObjectEnd();
    else writer.WriteNull();

    writer.WriteArrayEnd();
  }

  public static JArrayToContainer(jArray: any[]) {
    let container = new Container();
    container.content = this.JArrayToRuntimeObjList(jArray, true);

    let terminatingObj = jArray[jArray.length - 1] as Record<string, any>;
    if (terminatingObj != null) {
      let namedOnlyContent = new Map();

      for (let key in terminatingObj) {
        if (key == "#f") {
          container.countFlags = parseInt(terminatingObj[key]);
        } else if (key == "#n") {
          container.name = terminatingObj[key].toString();
        } else {
          let namedContentItem = this.JTokenToRuntimeObject(
            terminatingObj[key],
          );
          // var namedSubContainer = namedContentItem as Container;
          let namedSubContainer = asOrNull(namedContentItem, Container);
          if (namedSubContainer) namedSubContainer.name = key;
          namedOnlyContent.set(key, namedContentItem);
        }
      }

      container.namedOnlyContent = namedOnlyContent;
    }

    return container;
  }

  public static JObjectToChoice(jObj: Record<string, any>) {
    let choice = new Choice();
    choice.text = jObj["text"].toString();
    choice.index = parseInt(jObj["index"]);
    choice.sourcePath = jObj["originalChoicePath"].toString();
    choice.originalThreadIndex = parseInt(jObj["originalThreadIndex"]);
    choice.pathStringOnChoice = jObj["targetPath"].toString();
    choice.tags = this.JArrayToTags(jObj);
    // `isInvisibleDefault` is the runtime flag that marks a fallback
    // choice (`* -> target` with no choice text — picked automatically
    // when no other choices match). Without round-tripping it, loaded
    // states see the fallback in `currentChoices` instead of having it
    // auto-followed by `TryFollowDefaultInvisibleChoice`. Default to
    // `false` for backward-compat with saves that predate this field.
    choice.isInvisibleDefault = jObj["isInvisibleDefault"] === true;
    return choice;
  }

  public static JArrayToTags(jObj: Record<string, any>) {
    if (jObj["tags"]) {
      return jObj["tags"];
    } else {
      return null;
    }
  }

  public static WriteChoice(writer: SimpleJson.Writer, choice: Choice) {
    writer.WriteObjectStart();
    writer.WriteProperty("text", choice.text);
    writer.WriteIntProperty("index", choice.index);
    writer.WriteProperty("originalChoicePath", choice.sourcePath);
    writer.WriteIntProperty("originalThreadIndex", choice.originalThreadIndex);
    writer.WriteProperty("targetPath", choice.pathStringOnChoice);
    // Only emit the flag when it's `true` — keeps the wire format
    // unchanged for the common case (regular choices) so saves stay
    // compact and existing readers don't see an unexpected new field.
    // `JObjectToChoice` defaults the field to `false` when absent.
    if (choice.isInvisibleDefault) {
      writer.WriteProperty("isInvisibleDefault", choice.isInvisibleDefault);
    }
    this.WriteChoiceTags(writer, choice);
    writer.WriteObjectEnd();
  }

  public static WriteChoiceTags(writer: SimpleJson.Writer, choice: Choice) {
    if (choice.tags && choice.tags.length > 0) {
      writer.WritePropertyStart("tags");
      writer.WriteArrayStart();
      for (const tag of choice.tags!) {
        writer.Write(tag);
      }
      writer.WriteArrayEnd();
      writer.WritePropertyEnd();
    }
  }

  public static WriteInkList(writer: SimpleJson.Writer, listVal: ListValue) {
    let rawList = listVal.value;
    if (rawList === null) {
      return throwNullException("rawList");
    }

    writer.WriteObjectStart();
    writer.WritePropertyStart("list");
    writer.WriteObjectStart();

    for (let [key, val] of rawList) {
      let item = InkListItem.fromSerializedKey(key);
      let itemVal = val;

      if (item.itemName === null) {
        return throwNullException("item.itemName");
      }

      writer.WritePropertyNameStart();
      writer.WritePropertyNameInner(item.originName ? item.originName : "?");
      writer.WritePropertyNameInner(".");
      writer.WritePropertyNameInner(item.itemName);
      writer.WritePropertyNameEnd();

      writer.Write(itemVal);

      writer.WritePropertyEnd();
    }

    writer.WriteObjectEnd();

    writer.WritePropertyEnd();

    if (
      rawList.Count == 0 &&
      rawList.originNames != null &&
      rawList.originNames.length > 0
    ) {
      writer.WritePropertyStart("origins");
      writer.WriteArrayStart();
      for (let name of rawList.originNames) writer.Write(name);
      writer.WriteArrayEnd();
      writer.WritePropertyEnd();
    }

    writer.WriteObjectEnd();
  }

  public static ListDefinitionsToJToken(origin: ListDefinitionsOrigin) {
    let result: Record<string, any> = {};

    for (let def of origin.lists) {
      let listDefJson: Record<string, any> = {};

      for (let [key, val] of def.items) {
        let item = InkListItem.fromSerializedKey(key);
        if (item.itemName === null) {
          return throwNullException("item.itemName");
        }
        listDefJson[item.itemName] = val;
      }

      result[def.name] = listDefJson;
    }

    return result;
  }

  public static JTokenToListDefinitions(obj: Record<string, any>) {
    // var defsObj = (Dictionary<string, object>)obj;
    let defsObj = obj;

    let allDefs: ListDefinition[] = [];

    for (let key in defsObj) {
      if (defsObj.hasOwnProperty(key)) {
        let name = key.toString();
        // var listDefJson = (Dictionary<string, object>)kv.Value;
        let listDefJson = defsObj[key] as Record<string, any>;

        // Cast (string, object) to (string, int) for items
        let items: Map<string, number> = new Map();

        for (let nameValueKey in listDefJson) {
          if (defsObj.hasOwnProperty(key)) {
            let nameValue = listDefJson[nameValueKey];
            items.set(nameValueKey, parseInt(nameValue));
          }
        }

        let def = new ListDefinition(name, items);
        allDefs.push(def);
      }
    }

    return new ListDefinitionsOrigin(allDefs);
  }

  private static _controlCommandNames = (() => {
    let _controlCommandNames: string[] = [];

    _controlCommandNames[ControlCommand.CommandType.EvalStart] = "ev";
    _controlCommandNames[ControlCommand.CommandType.EvalOutput] = "out";
    _controlCommandNames[ControlCommand.CommandType.EvalEnd] = "/ev";
    _controlCommandNames[ControlCommand.CommandType.Duplicate] = "du";
    _controlCommandNames[ControlCommand.CommandType.PopEvaluatedValue] = "pop";
    _controlCommandNames[ControlCommand.CommandType.PopFunction] = "~ret";
    _controlCommandNames[ControlCommand.CommandType.PopTunnel] = "->->";
    _controlCommandNames[ControlCommand.CommandType.BeginString] = "str";
    _controlCommandNames[ControlCommand.CommandType.EndString] = "/str";
    _controlCommandNames[ControlCommand.CommandType.NoOp] = "nop";
    _controlCommandNames[ControlCommand.CommandType.TurnsSince] = "turns";
    _controlCommandNames[ControlCommand.CommandType.ReadCount] = "readc";
    _controlCommandNames[ControlCommand.CommandType.VisitIndex] = "visit";
    _controlCommandNames[ControlCommand.CommandType.SequenceShuffleIndex] =
      "seq";
    _controlCommandNames[ControlCommand.CommandType.StartThread] = "thread";
    _controlCommandNames[ControlCommand.CommandType.Done] = "done";
    _controlCommandNames[ControlCommand.CommandType.End] = "end";
    _controlCommandNames[ControlCommand.CommandType.ListFromInt] = "listInt";
    _controlCommandNames[ControlCommand.CommandType.ListRange] = "range";
    _controlCommandNames[ControlCommand.CommandType.ListRandom] = "lrnd";
    _controlCommandNames[ControlCommand.CommandType.BeginTag] = "#";
    _controlCommandNames[ControlCommand.CommandType.EndTag] = "/#";
    _controlCommandNames[ControlCommand.CommandType.BeginObject] = "obj{";
    _controlCommandNames[ControlCommand.CommandType.EndObject] = "}obj";
    _controlCommandNames[ControlCommand.CommandType.IndexValue] = "idx";
    _controlCommandNames[ControlCommand.CommandType.StoreIndex] = "idx=";
    _controlCommandNames[ControlCommand.CommandType.CallValueAsFunction] =
      "call";
    _controlCommandNames[ControlCommand.CommandType.BeginScope] = "scope{";
    _controlCommandNames[ControlCommand.CommandType.EndScope] = "}scope";
    // Placeholder — actual serialization uses the dynamic
    // `stdlib:<name>:<arity>` form (see WriteRuntimeObject's special
    // case for RunStdLibFunction). The placeholder satisfies the
    // validation loop at the bottom of this builder that every enum
    // value has a name.
    _controlCommandNames[ControlCommand.CommandType.RunStdLibFunction] =
      "stdlib:?";
    // Placeholders — actual serialization uses the dynamic
    // `pack:<n>` / `unpack:<n>` forms (see WriteRuntimeObject's
    // special cases for PackTuple/UnpackTuple). These satisfy the
    // "no missing names" validation loop below.
    _controlCommandNames[ControlCommand.CommandType.PackTuple] = "pack:?";
    _controlCommandNames[ControlCommand.CommandType.UnpackTuple] = "unpack:?";
    // Placeholder — actual serialization uses the dynamic
    // `sc:<op>:<skipCount>` form (see WriteRuntimeObject's special
    // case for ShortCircuit).
    _controlCommandNames[ControlCommand.CommandType.ShortCircuit] = "sc:?";

    for (let i = 0; i < ControlCommand.CommandType.TOTAL_VALUES; ++i) {
      if (_controlCommandNames[i] == null)
        throw new Error("Control command not accounted for in serialisation");
    }

    return _controlCommandNames;
  })();
}
