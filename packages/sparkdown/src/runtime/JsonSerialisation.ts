import {
  Value,
  IntValue,
  FloatValue,
  StringValue,
  VariablePointerValue,
  BoolValue,
  MultiValue,
  NullValue,
  ObjectValue,
  AbstractValue,
  SymbolRef,
  SymbolValue,
} from "./Value";
import { ControlCommand } from "./ControlCommand";
import { VariableAssignment } from "./VariableAssignment";
import { NativeFunctionCall } from "./NativeFunctionCall";
import { Void } from "./Void";
import { Tag } from "./Tag";
import { InkObject } from "./Object";
import { asOrNull } from "./TypeAssertion";
import { throwNullException } from "./NullException";
import { SimpleJson } from "./SimpleJson";

interface WriterMemo {
  nextId: number;
  ids: Map<object, number>;
  tables: Map<number, ObjectValue>;
  nextCellId: number;
  cellIds: Map<VariablePointerValue, number>;
  anchors: Map<object, string> | null;
  cellAnchors: Map<VariablePointerValue, string> | null;
  symbols: ((value: SymbolValue) => string) | null;
}

export class JsonSerialisation {
  private static writerObjectMemo(writer: SimpleJson.Writer): WriterMemo {
    const w = writer as unknown as { __objGraphMemo?: WriterMemo };
    w.__objGraphMemo ??= {
      nextId: 1,
      ids: new Map<object, number>(),
      tables: new Map<number, ObjectValue>(),
      nextCellId: 1,
      cellIds: new Map<VariablePointerValue, number>(),
      anchors: null,
      cellAnchors: null,
      symbols: null,
    };
    return w.__objGraphMemo;
  }

  public static SetWriterSymbolEncoder(
    writer: SimpleJson.Writer,
    encode: (value: SymbolValue) => string,
  ): void {
    JsonSerialisation.writerObjectMemo(writer).symbols = encode;
  }

  private static _loadSessionSymbolDecoder:
    | ((saved: string) => SymbolValue)
    | null = null;

  public static SetLoadSessionSymbolDecoder(
    decode: (saved: string) => SymbolValue,
  ): void {
    this._loadSessionSymbolDecoder = decode;
  }

  public static SetWriterAnchors(
    writer: SimpleJson.Writer,
    anchors: Map<object, string>,
    cellAnchors: Map<VariablePointerValue, string>,
  ): void {
    const memo = JsonSerialisation.writerObjectMemo(writer);
    memo.anchors = anchors;
    memo.cellAnchors = cellAnchors;
  }

  private static _loadSessionCellAnchorResolver:
    | ((
        anchor: string,
      ) => { cell: VariablePointerValue; restore: boolean } | null)
    | null = null;

  public static SetLoadSessionCellAnchorResolver(
    resolve: (
      anchor: string,
    ) => { cell: VariablePointerValue; restore: boolean } | null,
  ): void {
    this._loadSessionCellAnchorResolver = resolve;
  }

  private static anchoredCellForLoad(
    anchor: string,
    id: number,
  ): { cell: VariablePointerValue; restore: boolean } | null {
    const found = this._loadSessionCellAnchorResolver?.(anchor) ?? null;
    if (!found) return null;
    const slot = this._loadSessionCellsById.get(id);
    if (slot && slot !== found.cell) return null;
    this._loadSessionCellsById.set(id, found.cell);
    if (!found.restore) this._loadSessionConstantCells.add(found.cell);
    return found;
  }

  private static _loadSessionConstantCells = new Set<VariablePointerValue>();

  private static _loadSessionAnchorResolver:
    | ((anchor: string) => { table: ObjectValue; restore: boolean } | null)
    | null = null;

  public static SetLoadSessionAnchorResolver(
    resolve: (
      anchor: string,
    ) => { table: ObjectValue; restore: boolean } | null,
  ): void {
    this._loadSessionAnchorResolver = resolve;
  }

  private static anchoredObjectForLoad(
    anchor: string,
    objid: unknown,
  ): { table: ObjectValue; restore: boolean } | null {
    const found = this._loadSessionAnchorResolver?.(anchor) ?? null;
    if (!found || found.table.value === null) return null;
    if (objid !== undefined) {
      const id = parseInt(String(objid));
      const slot = this._loadSessionObjectsById.get(id);
      if (slot && slot !== found.table) return null;
      this._loadSessionObjectsById.set(id, found.table);
    }
    return found;
  }

  private static _loadSessionObjectsById = new Map<number, ObjectValue>();

  private static _loadSessionCellsById = new Map<
    number,
    VariablePointerValue
  >();

  private static _pendingDefineRefs: { obj: ObjectValue; className: string }[] =
    [];

  public static ResetObjectLoadSession(): void {
    this._loadSessionObjectsById = new Map();
    this._loadSessionCellsById = new Map();
    this._loadSessionConstantCells = new Set();
    this._loadSessionAnchorResolver = null;
    this._loadSessionCellAnchorResolver = null;
    this._loadSessionSymbolDecoder = null;
    this._pendingDefineRefs = [];
  }

  private static WriteTableBody(
    writer: SimpleJson.Writer,
    objVal: ObjectValue,
  ): void {
    const map = objVal.value as Map<string, AbstractValue> | null;
    const memo = JsonSerialisation.writerObjectMemo(writer);
    const defInfo = JsonSerialisation.defineSerializationInfo(objVal);

    writer.WriteObjectStart();
    if (map !== null) {
      writer.WriteIntProperty("objid", memo.ids.get(map)!);
      const anchor = memo.anchors?.get(map);
      if (anchor !== undefined) writer.WriteProperty("anchor", anchor);
    }
    writer.WritePropertyStart("obj");
    writer.WriteObjectStart();
    if (map !== null) {
      for (const [k, v] of map) {
        if (k === "__iter_key_snapshot") continue;
        if (defInfo && !defInfo.storeNames.has(k)) continue;
        writer.WritePropertyStart(k);
        if (v && v instanceof InkObject) {
          this.WriteRuntimeObject(writer, v);
        } else {
          writer.WriteNull();
        }
        writer.WritePropertyEnd();
      }
    }
    writer.WriteObjectEnd();
    writer.WritePropertyEnd();
    if (defInfo) {
      writer.WriteProperty(
        defInfo.kind === "named" ? "defself" : "defref",
        defInfo.name,
      );
    } else if (objVal.metatable) {
      writer.WritePropertyStart("mt");
      this.WriteRuntimeObject(writer, objVal.metatable);
      writer.WritePropertyEnd();
    }
    if (objVal.isFrozen) {
      writer.WriteIntProperty("frz", 1);
    }
    const cap = map !== null ? ((map as any).__luauCapacity ?? 0) : 0;
    const bnd = map !== null ? ((map as any).__luauBoundary ?? 0) : 0;
    if (cap > 0) writer.WriteIntProperty("cap", cap);
    if (bnd > 0) writer.WriteIntProperty("bnd", bnd);
    writer.WriteObjectEnd();
  }

  public static WrittenTables(
    writer: SimpleJson.Writer,
  ): ReadonlyMap<number, ObjectValue> {
    return JsonSerialisation.writerObjectMemo(writer).tables;
  }

  public static WrittenCells(
    writer: SimpleJson.Writer,
  ): ReadonlyMap<VariablePointerValue, number> {
    return JsonSerialisation.writerObjectMemo(writer).cellIds;
  }

  public static WriteTableDefinition(
    writer: SimpleJson.Writer,
    table: ObjectValue,
  ): void {
    this.WriteTableBody(writer, table);
  }

  public static RedefineLoadSessionTable(
    token: Record<string, any>,
    before: (table: ObjectValue) => void,
  ): ObjectValue | null {
    const id = parseInt(String(token["objid"]));
    const table = this._loadSessionObjectsById.get(id);
    if (!table || table.value === null) {
      return null;
    }
    before(table);
    const content = token["obj"];
    if (
      (token["defself"] !== undefined || token["defref"] !== undefined) &&
      content &&
      typeof content === "object"
    ) {
      const info = this.defineSerializationInfo(table);
      const anchored =
        token["anchor"] !== undefined
          ? (this._loadSessionAnchorResolver?.(String(token["anchor"])) ?? null)
          : null;
      if (info && (!anchored || anchored.restore)) {
        const map = table.value as Map<string, AbstractValue>;
        for (const name of info.storeNames) {
          if (!Object.prototype.hasOwnProperty.call(content, name)) {
            map.delete(name);
          }
        }
      }
    }
    if (token["anchor"] !== undefined) {
      this.JTokenToRuntimeObject(token);
      return table;
    }
    const isDefine =
      token["defref"] !== undefined || token["defself"] !== undefined;
    const map = table.value as Map<string, AbstractValue> & {
      __luauCapacity?: number;
      __luauBoundary?: number;
    };
    if (!isDefine || token["defref"] !== undefined) {
      map.clear();
    }
    if (!isDefine) {
      table.metatable = null;
      delete map.__luauCapacity;
      delete map.__luauBoundary;
    }
    table.RestoreFrozen(false);
    this.JTokenToRuntimeObject(token);
    return table;
  }

  public static LoadSessionCell(id: number): VariablePointerValue | null {
    const cell = this._loadSessionCellsById.get(id) ?? null;
    return cell && !this._loadSessionConstantCells.has(cell) ? cell : null;
  }

  public static LoadSessionCells(): ReadonlyMap<number, VariablePointerValue> {
    return this._loadSessionCellsById;
  }

  public static ReadDefinitions(token: unknown): void {
    if (Array.isArray(token)) {
      token.forEach((item) => this.ReadDefinitions(item));
      return;
    }
    if (!token || typeof token !== "object") {
      return;
    }
    const obj = token as Record<string, any>;
    if (
      (obj["obj"] !== undefined && obj["objid"] !== undefined) ||
      (obj["^var"] !== undefined && obj["cell"] !== undefined)
    ) {
      this.JTokenToRuntimeObject(obj);
      return;
    }
    if (obj["^symsave"] !== undefined) {
      return;
    }
    for (const value of Object.values(obj)) {
      this.ReadDefinitions(value);
    }
  }

  private static registerPendingDefineRef(
    obj: ObjectValue,
    className: string,
  ): void {
    this._pendingDefineRefs.push({ obj, className });
  }

  static RelinkPendingDefineRefs(
    resolve: (className: string) => ObjectValue | null,
  ): void {
    for (const { obj, className } of this._pendingDefineRefs) {
      const cls = resolve(className);
      if (cls instanceof ObjectValue) {
        const mt = new Map<string, AbstractValue>();
        mt.set("__index", cls);
        obj.metatable = new ObjectValue(mt);
      }
    }
    this._pendingDefineRefs = [];
  }

  private static objectForLoadSessionId(id: number): ObjectValue {
    let existing = this._loadSessionObjectsById.get(id);
    if (!existing) {
      existing = new ObjectValue(new Map<string, AbstractValue>());
      this._loadSessionObjectsById.set(id, existing);
    }
    return existing;
  }

  private static upvalueCellForLoadSessionId(
    id: number,
    variableName: string,
    contextIndex: number,
  ): VariablePointerValue {
    let existing = this._loadSessionCellsById.get(id);
    if (!existing) {
      existing = new VariablePointerValue(variableName, contextIndex);
      this._loadSessionCellsById.set(id, existing);
    }
    return existing;
  }

  static readonly DEFINE_MARKER = "__define";

  static defineSerializationInfo(
    objVal: ObjectValue,
  ): { kind: "named" | "instance"; name: string; storeNames: Set<string> } | null {
    const mt = objVal.metatable;
    if (!(mt instanceof ObjectValue)) return null;
    const mtMap = mt.value as Map<string, AbstractValue>;
    const ownDefine = mtMap.get(JsonSerialisation.DEFINE_MARKER);
    if (ownDefine instanceof StringValue) {
      return {
        kind: "named",
        name: ownDefine.value!,
        storeNames: JsonSerialisation.collectDefineStoreNames(objVal),
      };
    }
    const indexTarget = mtMap.get("__index");
    if (indexTarget instanceof ObjectValue) {
      const idxMt = indexTarget.metatable;
      const idxDefine =
        idxMt instanceof ObjectValue
          ? (idxMt.value as Map<string, AbstractValue>).get(
              JsonSerialisation.DEFINE_MARKER,
            )
          : null;
      if (idxDefine instanceof StringValue) {
        return {
          kind: "instance",
          name: idxDefine.value!,
          storeNames: JsonSerialisation.collectDefineStoreNames(objVal),
        };
      }
    }
    return null;
  }

  private static collectDefineStoreNames(objVal: ObjectValue): Set<string> {
    const names = new Set<string>();
    let cur: ObjectValue | null = objVal;
    let guard = 0;
    while (cur instanceof ObjectValue && guard++ < 64) {
      const map = cur.value as Map<string, AbstractValue> | null;
      const sp = map?.get("__storeProps");
      if (sp instanceof ObjectValue) {
        for (const v of (sp.value as Map<string, AbstractValue>).values()) {
          if (v instanceof StringValue) names.add(v.value!);
        }
      }
      const mt: ObjectValue | null = cur.metatable;
      const idx: AbstractValue | null =
        mt instanceof ObjectValue
          ? ((mt.value as Map<string, AbstractValue>).get("__index") ?? null)
          : null;
      cur = idx instanceof ObjectValue ? idx : null;
    }
    return names;
  }

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

  public static WriteRuntimeObject(
    writer: SimpleJson.Writer,
    obj: InkObject,
    onWriteRuntimeObject?: (
      writer: SimpleJson.Writer,
      obj: InkObject,
    ) => boolean,
  ): void {
    if (onWriteRuntimeObject && onWriteRuntimeObject(writer, obj)) {
      return;
    }

    let nullVal = asOrNull(obj, NullValue);
    if (nullVal) {
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

    let multiVal = asOrNull(obj, MultiValue);
    if (multiVal) {
      writer.WriteObjectStart();
      writer.WritePropertyStart("tuple");
      this.WriteListRuntimeObjs(writer, multiVal.values);
      writer.WritePropertyEnd();
      writer.WriteObjectEnd();
      return;
    }

    let objVal = asOrNull(obj, ObjectValue);
    if (objVal) {
      const map = objVal.value as Map<string, AbstractValue> | null;
      const memo = JsonSerialisation.writerObjectMemo(writer);
      if (map !== null) {
        const existingId = memo.ids.get(map);
        if (existingId !== undefined) {
          writer.WriteObjectStart();
          writer.WriteIntProperty("objref", existingId);
          const anchor = memo.anchors?.get(map);
          if (anchor !== undefined) writer.WriteProperty("anchor", anchor);
          writer.WriteObjectEnd();
          return;
        }
        memo.ids.set(map, memo.nextId);
        memo.tables.set(memo.nextId, objVal);
        memo.nextId += 1;
      }
      this.WriteTableBody(writer, objVal);
      return;
    }

    if (obj instanceof SymbolValue) {
      const encode = JsonSerialisation.writerObjectMemo(writer).symbols;
      if (encode) {
        writer.WriteObjectStart();
        writer.WriteProperty("^symsave", encode(obj));
        writer.WriteObjectEnd();
        return;
      }
      const ref = obj.ref;
      writer.WriteObjectStart();
      writer.WritePropertyStart("^sym");
      writer.WriteArrayStart();
      writer.WriteInt(ref.symbol);
      writer.WriteInt(ref.generation);
      writer.Write(ref.name ?? "");
      writer.Write(ref.label);
      writer.WriteArrayEnd();
      writer.WritePropertyEnd();
      writer.WriteObjectEnd();
      return;
    }

    let varPtrVal = asOrNull(obj, VariablePointerValue);
    if (varPtrVal) {
      writer.WriteObjectStart();
      writer.WriteProperty("^var", varPtrVal.value);
      writer.WriteIntProperty("ci", varPtrVal.contextIndex);
      if (varPtrVal.contextIndex > 0 || varPtrVal.isClosed) {
        const memo = JsonSerialisation.writerObjectMemo(writer);
        const existingId = memo.cellIds.get(varPtrVal);
        const anchor = memo.cellAnchors?.get(varPtrVal);
        if (existingId !== undefined) {
          writer.WriteIntProperty("cell", existingId);
          if (anchor !== undefined) writer.WriteProperty("anchor", anchor);
        } else {
          const id = memo.nextCellId++;
          memo.cellIds.set(varPtrVal, id);
          writer.WriteIntProperty("cell", id);
          if (anchor !== undefined) writer.WriteProperty("anchor", anchor);
          if (varPtrVal.scopeIndex >= 0) {
            writer.WriteIntProperty("si", varPtrVal.scopeIndex);
          }
          if (varPtrVal.isClosed) {
            writer.WriteIntProperty("closed", 1);
            if (varPtrVal.closedValue) {
              writer.WritePropertyStart("cv");
              this.WriteRuntimeObject(writer, varPtrVal.closedValue);
              writer.WritePropertyEnd();
            }
          }
        }
      }
      writer.WriteObjectEnd();
      return;
    }

    let controlCmd = asOrNull(obj, ControlCommand);
    if (controlCmd) {
      writer.Write(
        JsonSerialisation._controlCommandNames[controlCmd.commandType]!,
      );
      return;
    }

    let nativeFunc = asOrNull(obj, NativeFunctionCall);
    if (nativeFunc) {
      let name = nativeFunc.name;

      if (name == "^") name = "L^";

      if (nativeFunc.isVariadic) {
        name = `${name}@${nativeFunc.numberOfParameters}`;
      }

      writer.Write(name);
      return;
    }

    let varAss = asOrNull(obj, VariableAssignment);
    if (varAss) {
      writer.WriteObjectStart();

      let key = varAss.isGlobal ? "VAR=" : "temp=";
      writer.WriteProperty(key, varAss.variableName);

      if (!varAss.isNewDeclaration) writer.WriteProperty("re", true);
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

  public static JTokenToRuntimeObject(token: any): InkObject | null {
    if (
      (typeof token === "number" && !isNaN(token)) ||
      typeof token === "boolean"
    ) {
      return Value.Create(token);
    }

    if (typeof token === "string") {
      let str = token.toString();

      const floatRepresentation =
        /^(-?[0-9]+(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?f)$/.exec(str);
      if (floatRepresentation) {
        return new FloatValue(parseFloat(floatRepresentation[0]));
      }

      if (str === "inff") return new FloatValue(Infinity);
      if (str === "-inff") return new FloatValue(-Infinity);
      if (str === "nanf") return new FloatValue(NaN);

      let firstChar = str[0];
      if (firstChar == "^") return new StringValue(str.substring(1));
      else if (firstChar == "\n" && str.length == 1)
        return new StringValue("\n");

      for (let i = 0; i < JsonSerialisation._controlCommandNames.length; ++i) {
        let cmdName = JsonSerialisation._controlCommandNames[i];
        if (str == cmdName) {
          return new ControlCommand(i);
        }
      }

      if (str == "L^") str = "^";
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

      if (str == "void") return new Void();

      if (str == "nil") return new NullValue();
    }

    if (typeof token === "object" && !Array.isArray(token)) {
      let obj = token as Record<string, any>;
      let propValue;

      if (typeof obj["^symsave"] === "string") {
        if (!this._loadSessionSymbolDecoder) {
          throw new Error("A function value of a save read without its program.");
        }
        return this._loadSessionSymbolDecoder(obj["^symsave"]);
      }

      if (Array.isArray(obj["^sym"])) {
        const [symbol, generation, name, label] = obj["^sym"];
        return new SymbolValue(
          new SymbolRef(
            Number(symbol),
            Number(generation),
            name ? String(name) : null,
            String(label ?? ""),
          ),
        );
      }

      if (obj["^var"]) {
        propValue = obj["^var"];
        const contextIndex = "ci" in obj ? parseInt(obj["ci"]) : -1;
        if (obj["cell"] !== undefined) {
          const id = parseInt(obj["cell"]);
          const anchored =
            obj["anchor"] !== undefined
              ? JsonSerialisation.anchoredCellForLoad(String(obj["anchor"]), id)
              : null;
          if (anchored) {
            if (obj["closed"] && obj["cv"] !== undefined) {
              const value = this.JTokenToRuntimeObject(obj["cv"]);
              if (anchored.restore) anchored.cell.closedValue = value;
            } else if (obj["closed"] && anchored.restore) {
              anchored.cell.closedValue = null;
            }
            return anchored.cell;
          }
          const cell = JsonSerialisation.upvalueCellForLoadSessionId(
            id,
            propValue.toString(),
            contextIndex,
          );
          if (obj["si"] !== undefined) cell.scopeIndex = parseInt(obj["si"]);
          if (obj["closed"]) {
            cell.closedValue =
              obj["cv"] !== undefined
                ? this.JTokenToRuntimeObject(obj["cv"])
                : null;
          }
          return cell;
        }
        let varPtr = new VariablePointerValue(propValue.toString());
        varPtr.contextIndex = contextIndex;
        return varPtr;
      }

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

      if (Array.isArray(obj["tuple"])) {
        const values: AbstractValue[] = [];
        for (const t of obj["tuple"]) {
          const v = asOrNull(this.JTokenToRuntimeObject(t), AbstractValue);
          values.push(v ?? new NullValue());
        }
        return new MultiValue(values);
      }

      if (obj["objref"] !== undefined) {
        if (obj["anchor"] !== undefined) {
          const anchored = JsonSerialisation.anchoredObjectForLoad(
            String(obj["anchor"]),
            obj["objref"],
          );
          if (anchored) return anchored.table;
        }
        return JsonSerialisation.objectForLoadSessionId(
          parseInt(obj["objref"]),
        );
      }

      if (obj["obj"] !== undefined) {
        const objContent = obj["obj"] as Record<string, any>;
        const isDefine =
          obj["defref"] !== undefined || obj["defself"] !== undefined;
        const anchored =
          obj["anchor"] !== undefined
            ? JsonSerialisation.anchoredObjectForLoad(
                String(obj["anchor"]),
                obj["objid"],
              )
            : null;
        if (anchored) {
          const table = anchored.table;
          const target = anchored.restore
            ? (table.value as Map<string, AbstractValue>)
            : new Map<string, AbstractValue>();
          if (anchored.restore && !isDefine) target.clear();
          for (const key in objContent) {
            if (!Object.prototype.hasOwnProperty.call(objContent, key))
              continue;
            const child = this.JTokenToRuntimeObject(objContent[key]);
            const childVal = asOrNull(child, AbstractValue);
            if (childVal) target.set(key, childVal);
          }
          const mtParsed =
            !isDefine && obj["mt"] !== undefined
              ? this.JTokenToRuntimeObject(obj["mt"])
              : null;
          if (anchored.restore) {
            table.RestoreFrozen(!!obj["frz"]);
            if (!isDefine) {
              table.metatable = asOrNull(mtParsed, ObjectValue);
              if (obj["cap"] !== undefined) {
                (target as any).__luauCapacity = parseInt(obj["cap"]);
              } else {
                delete (target as any).__luauCapacity;
              }
              if (obj["bnd"] !== undefined) {
                (target as any).__luauBoundary = parseInt(obj["bnd"]);
              } else {
                delete (target as any).__luauBoundary;
              }
            }
          }
          return table;
        }
        const result =
          obj["objid"] !== undefined
            ? JsonSerialisation.objectForLoadSessionId(parseInt(obj["objid"]))
            : new ObjectValue(new Map<string, AbstractValue>());
        const entries = result.value!;
        for (const key in objContent) {
          if (!Object.prototype.hasOwnProperty.call(objContent, key)) continue;
          const child = this.JTokenToRuntimeObject(objContent[key]);
          const childVal = asOrNull(child, AbstractValue);
          if (childVal) entries.set(key, childVal);
        }
        if (obj["defref"] !== undefined) {
          JsonSerialisation.registerPendingDefineRef(
            result,
            String(obj["defref"]),
          );
        } else if (obj["defself"] !== undefined) {
          (result as any).__loadDefSelf = String(obj["defself"]);
        } else if (obj["mt"] !== undefined) {
          const mtParsed = this.JTokenToRuntimeObject(obj["mt"]);
          const mt = asOrNull(mtParsed, ObjectValue);
          if (mt) result.metatable = mt;
        }
        if (obj["frz"]) {
          result.Freeze();
        }
        if (obj["cap"] !== undefined) {
          (entries as any).__luauCapacity = parseInt(obj["cap"]);
        }
        if (obj["bnd"] !== undefined) {
          (entries as any).__luauBoundary = parseInt(obj["bnd"]);
        }
        return result;
      }
    }

    return null;
  }

  private static _controlCommandNames = (() => {
    let _controlCommandNames: string[] = [];

    _controlCommandNames[ControlCommand.CommandType.BeginString] = "str";
    _controlCommandNames[ControlCommand.CommandType.BeginTag] = "#";
    _controlCommandNames[ControlCommand.CommandType.EndTag] = "/#";
    _controlCommandNames[ControlCommand.CommandType.BeginScope] = "scope{";
    _controlCommandNames[ControlCommand.CommandType.EndScope] = "}scope";

    for (let i = 0; i < ControlCommand.CommandType.TOTAL_VALUES; ++i) {
      if (_controlCommandNames[i] == null)
        throw new Error("Control command not accounted for in serialisation");
    }

    return _controlCommandNames;
  })();
}
