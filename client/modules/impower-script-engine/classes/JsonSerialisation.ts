import { CommandType } from "../types/CommandType";
import { PushPopType } from "../types/PushPopType";
import { createValue } from "../utils/createValue";
import { BoolValue } from "./BoolValue";
import { Choice } from "./Choice";
import { ChoicePoint } from "./ChoicePoint";
import { Container, isContainer } from "./Container";
import { ControlCommand } from "./ControlCommand";
import { Divert } from "./Divert";
import { DivertTargetValue } from "./DivertTargetValue";
import { FloatValue } from "./FloatValue";
import { Glue } from "./Glue";
import { ImpowerList } from "./ImpowerList";
import {
  ImpowerListItem,
  ImpowerListItemFromSerializedKey,
} from "./ImpowerListItem";
import { ImpowerObject } from "./ImpowerObject";
import { IntValue } from "./IntValue";
import { JsonWriter } from "./JsonWriter";
import { ListDefinition } from "./ListDefinition";
import { ListDefinitionsOrigin } from "./ListDefinitionsOrigin";
import { ListValue } from "./ListValue";
import { NativeFunctionCall } from "./NativeFunctionCall";
import { NullException } from "./NullException";
import { Path } from "./Path";
import { StringValue } from "./StringValue";
import { Tag } from "./Tag";
import { VariableAssignment } from "./VariableAssignment";
import { VariablePointerValue } from "./VariablePointerValue";
import { VariableReference } from "./VariableReference";
import { Void } from "./Void";

export class JsonSerialisation {
  public static JArrayToRuntimeObjList(
    jArray: unknown[],
    skipLast = false
  ): ImpowerObject[] {
    let count = jArray.length;
    if (skipLast) count -= 1;

    const list: ImpowerObject[] = [];

    for (let i = 0; i < count; i += 1) {
      const jTok = jArray[i];
      const runtimeObj = this.JTokenToRuntimeObject(jTok);
      if (runtimeObj === null) {
        throw new NullException("runtimeObj");
      }
      list.push(runtimeObj);
    }

    return list;
  }

  public static WriteDictionaryRuntimeObjs(
    writer: JsonWriter,
    dict: Record<string, ImpowerObject>
  ): void {
    writer.WriteObjectStart();
    Object.entries(dict).forEach(([key, value]) => {
      writer.WritePropertyStart(key);
      this.WriteRuntimeObject(writer, value);
      writer.WritePropertyEnd();
    });
    writer.WriteObjectEnd();
  }

  public static WriteListRuntimeObjs(
    writer: JsonWriter,
    list: ImpowerObject[]
  ): void {
    writer.WriteArrayStart();
    list.forEach((value) => {
      this.WriteRuntimeObject(writer, value);
    });
    writer.WriteArrayEnd();
  }

  public static WriteIntDictionary(
    writer: JsonWriter,
    dict: Record<string, number>
  ): void {
    writer.WriteObjectStart();
    Object.entries(dict).forEach(([key, value]) => {
      writer.WriteIntProperty(key, value);
    });
    writer.WriteObjectEnd();
  }

  public static WriteRuntimeObject(
    writer: JsonWriter,
    obj: ImpowerObject
  ): void {
    const container = isContainer(obj) ? obj : null;
    if (container) {
      this.WriteRuntimeContainer(writer, container);
      return;
    }

    if (obj instanceof Divert) {
      let divTypeKey = "->";
      if (obj.isExternal) {
        divTypeKey = "x()";
      } else if (obj.pushesToStack) {
        if (obj.stackPushType === "Function") {
          divTypeKey = "f()";
        } else if (obj.stackPushType === "Tunnel") {
          divTypeKey = "->t->";
        }
      }

      let targetStr;
      if (obj.hasVariableTarget) {
        targetStr = obj.variableDivertName;
      } else {
        targetStr = obj.targetPathString;
      }

      writer.WriteObjectStart();
      writer.WriteProperty(divTypeKey, targetStr);

      if (obj.hasVariableTarget) {
        writer.WriteProperty("var", true);
      }

      if (obj.isConditional) {
        writer.WriteProperty("c", true);
      }

      if (obj.externalArgs > 0) {
        writer.WriteIntProperty("exArgs", obj.externalArgs);
      }

      writer.WriteObjectEnd();
      return;
    }

    if (obj instanceof ChoicePoint) {
      writer.WriteObjectStart();
      writer.WriteProperty("*", obj.pathStringOnChoice);
      writer.WriteIntProperty("flg", obj.flags);
      writer.WriteObjectEnd();
      return;
    }

    if (obj instanceof BoolValue) {
      writer.WriteBool(obj.value);
      return;
    }

    if (obj instanceof IntValue) {
      writer.WriteInt(obj.value);
      return;
    }

    if (obj instanceof FloatValue) {
      writer.WriteFloat(obj.value);
      return;
    }

    if (obj instanceof StringValue) {
      if (obj.isNewline) {
        writer.Write("\n", false);
      } else {
        writer.WriteStringStart();
        writer.WriteStringInner("^");
        writer.WriteStringInner(obj.value);
        writer.WriteStringEnd();
      }
      return;
    }

    if (obj instanceof ListValue) {
      this.WriteList(writer, obj);
      return;
    }

    if (obj instanceof DivertTargetValue) {
      writer.WriteObjectStart();
      if (obj.value === null) {
        throw new NullException("divTargetVal.value");
      }
      writer.WriteProperty("^->", obj.value.componentsString);
      writer.WriteObjectEnd();

      return;
    }

    if (obj instanceof VariablePointerValue) {
      writer.WriteObjectStart();
      writer.WriteProperty("^var", obj.value);
      writer.WriteIntProperty("ci", obj.contextIndex);
      writer.WriteObjectEnd();
      return;
    }

    if (obj instanceof Glue) {
      writer.Write("<>");
      return;
    }

    if (obj instanceof ControlCommand) {
      writer.Write(JsonSerialisation._controlCommandNames[obj.commandType]);
      return;
    }

    if (obj instanceof NativeFunctionCall) {
      let { name } = obj;

      if (name === "^") name = "L^";

      writer.Write(name);
      return;
    }

    if (obj instanceof VariableReference) {
      writer.WriteObjectStart();
      const readCountPath = obj.pathStringForCount;
      if (readCountPath != null) {
        writer.WriteProperty("CNT?", readCountPath);
      } else {
        writer.WriteProperty("VAR?", obj.name);
      }

      writer.WriteObjectEnd();
      return;
    }

    if (obj instanceof VariableAssignment) {
      writer.WriteObjectStart();

      const key = obj.isGlobal ? "VAR=" : "temp=";
      writer.WriteProperty(key, obj.variableName);

      // Reassignment?
      if (!obj.isNewDeclaration) writer.WriteProperty("re", true);

      writer.WriteObjectEnd();

      return;
    }

    if (obj instanceof Void) {
      writer.Write("void");
      return;
    }

    if (obj instanceof Tag) {
      writer.WriteObjectStart();
      writer.WriteProperty("#", obj.text);
      writer.WriteObjectEnd();
      return;
    }

    if (obj instanceof Choice) {
      this.WriteChoice(writer, obj);
      return;
    }

    throw new Error(`Failed to convert runtime object to Json token: ${obj}`);
  }

  public static JObjectToDictionaryRuntimeObjs(
    jObject: Record<string, unknown>
  ): Record<string, ImpowerObject> {
    const dict: Record<string, ImpowerObject> = {};

    Object.entries(jObject).forEach(([key]) => {
      if (jObject[key] !== undefined) {
        const inkObject = this.JTokenToRuntimeObject(jObject[key]);
        if (inkObject === null) {
          throw new NullException("inkObject");
        }
        dict[key] = inkObject;
      }
    });

    return dict;
  }

  public static JObjectToIntDictionary(
    jObject: Record<string, unknown>
  ): Record<string, number> {
    const dict: Record<string, number> = {};
    Object.entries(jObject).forEach(([key]) => {
      if (jObject[key] !== undefined) {
        dict[key] = Number(jObject[key]);
      }
    });
    return dict;
  }

  public static JTokenToRuntimeObject(token: unknown): ImpowerObject {
    if (
      (typeof token === "number" && !Number.isNaN(token)) ||
      typeof token === "boolean"
    ) {
      return createValue(token);
    }

    if (typeof token === "string") {
      let str = token.toString();

      // String value
      const firstChar = str[0];
      if (firstChar === "^") {
        return new StringValue(str.substring(1));
      }
      if (firstChar === "\n" && str.length === 1) {
        return new StringValue("\n");
      }

      // Glue
      if (str === "<>") {
        return new Glue();
      }

      // Control commands (would looking up in a hash set be faster?)
      const match = Object.entries(JsonSerialisation._controlCommandNames).find(
        ([, value]) => str === value
      );

      if (match) {
        const [commandKey] = match;
        return new ControlCommand(commandKey as CommandType);
      }

      // Native functions
      if (str === "L^") {
        str = "^";
      }
      if (NativeFunctionCall.CallExistsWithName(str)) {
        return NativeFunctionCall.CallWithName(str);
      }

      // Pop
      if (str === "->->") {
        return ControlCommand.PopTunnel();
      }
      if (str === "~ret") {
        return ControlCommand.PopFunction();
      }

      // Void
      if (str === "void") {
        return new Void();
      }
    }

    if (typeof token === "object" && !Array.isArray(token)) {
      const obj = token as Record<string, unknown>;
      let propValue;

      // Divert target value to path
      if (obj["^->"]) {
        propValue = obj["^->"];
        return new DivertTargetValue(new Path(propValue.toString()));
      }

      // VariablePointerValue
      if (obj["^var"]) {
        propValue = obj["^var"];
        const varPtr = new VariablePointerValue(propValue.toString());
        if ("ci" in obj) {
          propValue = obj.ci;
          varPtr.contextIndex = Number(propValue);
        }
        return varPtr;
      }

      // Divert
      let isDivert = false;
      let pushesToStack = false;
      let divPushType: PushPopType = "Function";
      let external = false;
      if (obj["->"]) {
        propValue = obj["->"];
        isDivert = true;
      } else if (obj["f()"]) {
        propValue = obj["f()"];
        isDivert = true;
        pushesToStack = true;
        divPushType = "Function";
      } else if (obj["->t->"]) {
        propValue = obj["->t->"];
        isDivert = true;
        pushesToStack = true;
        divPushType = "Tunnel";
      } else if (obj["x()"]) {
        propValue = obj["x()"];
        isDivert = true;
        external = true;
        pushesToStack = false;
        divPushType = "Function";
      }

      if (isDivert) {
        const divert = new Divert();
        divert.pushesToStack = pushesToStack;
        divert.stackPushType = divPushType;
        divert.isExternal = external;

        const target = propValue.toString();

        if (obj.var) {
          propValue = obj.var;
          divert.variableDivertName = target;
        } else {
          divert.targetPathString = target;
        }

        divert.isConditional = !!obj.c;

        if (external) {
          if (obj.exArgs) {
            propValue = obj.exArgs;
            divert.externalArgs = Number(propValue);
          }
        }

        return divert;
      }

      // Choice
      if (obj["*"]) {
        propValue = obj["*"];
        const choice = new ChoicePoint();
        choice.pathStringOnChoice = propValue.toString();

        if (obj.flg) {
          propValue = obj.flg;
          choice.flags = Number(propValue);
        }

        return choice;
      }

      // Variable reference
      if (obj["VAR?"]) {
        propValue = obj["VAR?"];
        return new VariableReference(propValue.toString());
      }
      if (obj["CNT?"]) {
        propValue = obj["CNT?"];
        const readCountVarRef = new VariableReference();
        readCountVarRef.pathStringForCount = propValue.toString();
        return readCountVarRef;
      }

      // Variable assignment
      let isVarAss = false;
      let isGlobalVar = false;
      if (obj["VAR="]) {
        propValue = obj["VAR="];
        isVarAss = true;
        isGlobalVar = true;
      } else if (obj["temp="]) {
        propValue = obj["temp="];
        isVarAss = true;
        isGlobalVar = false;
      }
      if (isVarAss) {
        const varName = propValue.toString();
        const isNewDecl = !obj.re;
        const varAss = new VariableAssignment(varName, isNewDecl);
        varAss.isGlobal = isGlobalVar;
        return varAss;
      }
      if (obj["#"] !== undefined) {
        propValue = obj["#"];
        return new Tag(propValue.toString());
      }

      // List value
      if (obj.list) {
        propValue = obj.list;
        const listContent = propValue as Record<string, unknown>;
        const rawList = new ImpowerList();
        if (obj.origins) {
          propValue = obj.origins;
          const namesAsObjs = propValue as string[];
          rawList.SetInitialOriginNames(namesAsObjs);
        }

        Object.entries(listContent).forEach(([key]) => {
          if (listContent[key] !== undefined) {
            const nameToVal = listContent[key];
            const item = new ImpowerListItem(key);
            const val = Number(nameToVal);
            rawList.Add(item, val);
          }
        });

        return new ListValue(rawList);
      }

      if (obj.originalChoicePath != null) return this.JObjectToChoice(obj);
    }

    // Array is always a Runtime.Container
    if (Array.isArray(token)) {
      return this.JArrayToContainer(token);
    }

    if (token === null || token === undefined) return null;

    throw new Error(
      `Failed to convert token to runtime object: ${JSON.stringify(token)}`
    );
  }

  public static WriteRuntimeContainer(
    writer: JsonWriter,
    container: Container,
    withoutName = false
  ): void {
    writer.WriteArrayStart();
    if (container === null) {
      throw new NullException("container");
    }
    container.content.forEach((c) => {
      this.WriteRuntimeObject(writer, c);
    });

    const { namedOnlyContent } = container;
    const { countFlags } = container;
    const hasNameProperty = container.name != null && !withoutName;

    const hasTerminator =
      namedOnlyContent != null || countFlags > 0 || hasNameProperty;
    if (hasTerminator) {
      writer.WriteObjectStart();
    }

    if (namedOnlyContent != null) {
      Object.entries(namedOnlyContent).forEach(([key, value]) => {
        const name = key;
        if (isContainer(value)) {
          const namedContainer = value;
          writer.WritePropertyStart(name);
          this.WriteRuntimeContainer(writer, namedContainer, true);
          writer.WritePropertyEnd();
        }
      });
    }

    if (hasNameProperty) writer.WriteProperty("#n", container.name);

    if (hasTerminator) writer.WriteObjectEnd();
    else writer.WriteNull();

    writer.WriteArrayEnd();
  }

  public static JArrayToContainer(jArray: unknown[]): Container {
    const container = new Container();
    container.content = this.JArrayToRuntimeObjList(jArray, true);

    const terminatingObj = jArray[jArray.length - 1] as Record<string, unknown>;
    if (terminatingObj != null) {
      const namedOnlyContent = {};

      Object.entries(terminatingObj).forEach(([key]) => {
        if (key === "#f") {
          container.countFlags = Number(terminatingObj[key]);
        } else if (key === "#n") {
          container.name = terminatingObj[key].toString();
        } else {
          const namedContentItem = this.JTokenToRuntimeObject(
            terminatingObj[key]
          );
          const namedSubContainer = isContainer(namedContentItem)
            ? namedContentItem
            : null;
          if (namedSubContainer) namedSubContainer.name = key;
          namedOnlyContent[key] = namedContentItem;
        }
      });

      container.namedOnlyContent = namedOnlyContent;
    }

    return container;
  }

  public static JObjectToChoice(jObj: Record<string, unknown>): Choice {
    const choice = new Choice();
    choice.text = jObj.text.toString();
    choice.index = Number(jObj.index);
    choice.sourcePath = jObj.originalChoicePath.toString();
    choice.originalThreadIndex = Number(jObj.originalThreadIndex);
    choice.pathStringOnChoice = jObj.targetPath.toString();
    return choice;
  }

  public static WriteChoice(writer: JsonWriter, choice: Choice): void {
    writer.WriteObjectStart();
    writer.WriteProperty("text", choice.text);
    writer.WriteIntProperty("index", choice.index);
    writer.WriteProperty("originalChoicePath", choice.sourcePath);
    writer.WriteIntProperty("originalThreadIndex", choice.originalThreadIndex);
    writer.WriteProperty("targetPath", choice.pathStringOnChoice);
    writer.WriteObjectEnd();
  }

  public static WriteList(writer: JsonWriter, listVal: ListValue): void {
    const rawList = listVal.value;
    if (rawList === null) {
      throw new NullException("rawList");
    }

    writer.WriteObjectStart();
    writer.WritePropertyStart("list");
    writer.WriteObjectStart();

    rawList.forEach((val: number, key: string) => {
      const item = ImpowerListItemFromSerializedKey(key);
      const itemVal = val;

      if (item.itemName === null) {
        throw new NullException("item.itemName");
      }

      writer.WritePropertyNameStart();
      writer.WritePropertyNameInner(item.originName ? item.originName : "?");
      writer.WritePropertyNameInner(".");
      writer.WritePropertyNameInner(item.itemName);
      writer.WritePropertyNameEnd();

      writer.Write(itemVal);

      writer.WritePropertyEnd();
    });

    writer.WriteObjectEnd();

    writer.WritePropertyEnd();

    if (
      rawList.Count === 0 &&
      rawList.originNames != null &&
      rawList.originNames.length > 0
    ) {
      writer.WritePropertyStart("origins");
      writer.WriteArrayStart();
      rawList.originNames.forEach((name) => {
        writer.Write(name);
      });
      writer.WriteArrayEnd();
      writer.WritePropertyEnd();
    }

    writer.WriteObjectEnd();
  }

  public static ListDefinitionsToJToken(
    origin: ListDefinitionsOrigin
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    origin.lists.forEach((def) => {
      const listDefJson: Record<string, unknown> = {};

      Object.entries(def.items).forEach(([key, val]) => {
        const item = ImpowerListItemFromSerializedKey(key);
        if (item.itemName === null) {
          throw new NullException("item.itemName");
        }
        listDefJson[item.itemName] = val;
      });

      result[def.name] = listDefJson;
    });

    return result;
  }

  public static JTokenToListDefinitions(
    obj: Record<string, unknown>
  ): ListDefinitionsOrigin {
    const defsObj = obj;

    const allDefs: ListDefinition[] = [];

    Object.entries(defsObj).forEach(([key]) => {
      if (defsObj[key] !== undefined) {
        const name = key.toString();
        const listDefJson = defsObj[key];

        // Cast (string, object) to (string, int) for items
        const items: Record<string, number> = {};

        Object.entries(listDefJson).forEach(([nameValueKey]) => {
          if (defsObj[key] !== undefined) {
            const nameValue = listDefJson[nameValueKey];
            items[nameValueKey] = Number(nameValue);
          }
        });

        const def = new ListDefinition(name, items);
        allDefs.push(def);
      }
    });

    return new ListDefinitionsOrigin(allDefs);
  }

  private static _controlCommandNames = ((): {
    [type in CommandType]: string;
  } => {
    return {
      EvalStart: "ev",
      EvalOutput: "out",
      EvalEnd: "/ev",
      Duplicate: "du",
      PopEvaluatedValue: "pop",
      PopFunction: "~ret",
      PopTunnel: "->->",
      BeginString: "str",
      EndString: "/str",
      NoOp: "nop",
      ChoiceCount: "choiceCnt",
      Turns: "turn",
      TurnsSince: "turns",
      ReadCount: "readc",
      Random: "rnd",
      SeedRandom: "srnd",
      VisitIndex: "visit",
      SequenceShuffleIndex: "seq",
      StartThread: "thread",
      Done: "done",
      End: "end",
      ListFromInt: "listInt",
      ListRange: "range",
      ListRandom: "lrnd",
    };
  })();
}
