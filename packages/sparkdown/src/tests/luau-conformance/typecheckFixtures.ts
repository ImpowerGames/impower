// Test fixtures from pinned Luau ClassFixture.cpp and TypeInfer.refinements.test.cpp.
// These synthetic extern types belong to test environments, not a runtime host.
import {
  AstExprConstantString,
  AstExprIndexName,
} from "../../compiler/typecheck/Ast";
import {
  addGlobalBinding,
  registerBuiltinGlobals,
} from "../../compiler/typecheck/BuiltinDefinitions";
import { Frontend } from "../../compiler/typecheck/Frontend";
import {
  boundType,
  emplaceType,
  externType,
  follow,
  functionType,
  genericType,
  get,
  intersectionType,
  metatableType,
  negationType,
  persist,
  Polarity,
  Property,
  Props,
  tableType,
  TypeFun,
  unionType,
  type TypeId,
} from "../../compiler/typecheck/Type";

export function registerHiddenTypes(frontend: Frontend): void {
  const arena = frontend.globals.globalTypes;
  const t = arena.addType(genericType({ name: "T", polarity: Polarity.Mixed }));
  const u = arena.addType(genericType({ name: "U", polarity: Polarity.Mixed }));
  const scope = frontend.globals.globalScope;
  scope.exportedTypeBindings.set(
    "Not",
    new TypeFun(arena.addType(negationType(t)), [{ ty: t }]),
  );
  scope.exportedTypeBindings.set(
    "Mt",
    new TypeFun(arena.addType(metatableType(t, u)), [{ ty: t }, { ty: u }]),
  );
  for (const [name, ty] of [
    ["fun", frontend.builtinTypes.functionType],
    ["cls", frontend.builtinTypes.externType],
    ["err", frontend.builtinTypes.errorType],
    ["tbl", frontend.builtinTypes.tableType],
  ] as const)
    scope.exportedTypeBindings.set(name, new TypeFun(ty));
}

export function fixtureFrontend(name = "Fixture"): Frontend | undefined {
  const f = new Frontend();
  if (name === "Fixture" || name === "IsSubtypeFixture") return f;
  if (name === "NegationFixture") {
    registerHiddenTypes(f);
    return f;
  }
  if (
    ![
      "BuiltinsFixture",
      "TypeStateFixture",
      "ExternTypeFixture",
      "RefinementExternTypeFixture",
    ].includes(name)
  )
    return undefined;
  registerBuiltinGlobals(f, f.globals);
  for (const global of ["game", "workspace", "script"])
    addGlobalBinding(f.globals, global, f.builtinTypes.anyType, "@luau");
  if (name === "ExternTypeFixture") registerExterns(f);
  if (name === "RefinementExternTypeFixture") registerRefinementExterns(f);
  return f;
}

function helpers(f: Frontend) {
  const a = f.globals.globalTypes;
  const cls = (
    name: string,
    parent?: TypeId,
    metatable?: TypeId,
    module = "Test",
  ) =>
    a.addType(
      externType(name, new Props(), {
        parent,
        metatable,
        definitionModuleName: module,
      }),
    );
  const prop = (owner: TypeId, name: string, ty: TypeId, readonly = false) =>
    get(owner, "ExternType")!.props.set(
      name,
      readonly ? Property.readonly(ty) : Property.rw(ty),
    );
  const fn = (self: TypeId | undefined, args: TypeId[], rets: TypeId[]) =>
    a.addType(
      functionType(
        a.addTypePack(self ? [self, ...args] : args),
        a.addTypePack(rets),
        { hasSelf: self !== undefined },
      ),
    );
  const alias = (name: string, ty: TypeId) =>
    f.globals.globalScope.exportedTypeBindings.set(name, new TypeFun(ty));
  const global = (name: string, ty: TypeId) =>
    addGlobalBinding(f.globals, name, ty, "@test");
  return { a, cls, prop, fn, alias, global };
}

function registerExterns(f: Frontend): void {
  const { a, cls, prop, fn, alias, global } = helpers(f);
  const n = f.builtinTypes.numberType,
    s = f.builtinTypes.stringType;
  const connection = cls("Connection", undefined, undefined, "Connection");
  const base = cls("BaseClass"),
    baseStatic = cls("BaseClass");
  prop(base, "BaseMethod", fn(base, [n], []), true);
  prop(base, "BaseField", n);
  prop(base, "Touched", connection, true);
  prop(connection, "Connect", fn(connection, [fn(undefined, [base], [])], []));
  prop(baseStatic, "StaticMethod", fn(undefined, [], [n]));
  prop(baseStatic, "Clone", fn(undefined, [base], [base]));
  prop(baseStatic, "New", fn(undefined, [], [base]));
  alias("BaseClass", base);
  global("BaseClass", baseStatic);
  const child = cls("ChildClass", base),
    childStatic = cls("ChildClass", baseStatic);
  prop(child, "Method", fn(child, [], [s]));
  prop(childStatic, "New", fn(undefined, [], [child]));
  alias("ChildClass", child);
  global("ChildClass", childStatic);
  for (const [name, parent] of [
    ["GrandChild", child],
    ["AnotherChild", base],
  ] as const) {
    const instance = cls(name, parent),
      staticType = cls(name, baseStatic);
    prop(instance, "Method", fn(instance, [], [s]));
    prop(staticType, "New", fn(undefined, [], [instance]));
    alias(name, instance);
    // The pinned fixture binds these globals to ChildClass's static type.
    global(name, childStatic);
  }
  const unrelated = cls("UnrelatedClass"),
    unrelatedStatic = cls("UnrelatedClass");
  prop(unrelatedStatic, "New", fn(undefined, [], [unrelated]));
  alias("UnrelatedClass", unrelated);
  global("UnrelatedClass", unrelatedStatic);
  const vectorMeta = a.addType(tableType()),
    vector = cls("Vector2", undefined, vectorMeta),
    vectorStatic = cls("Vector2");
  prop(vector, "X", n);
  prop(vector, "Y", n);
  prop(vectorStatic, "New", fn(undefined, [n, n], [vector]));
  get(vectorMeta, "TableType")!.props.set(
    "__add",
    Property.rw(fn(undefined, [vector, vector], [vector])),
  );
  get(vectorMeta, "TableType")!.props.set(
    "__mul",
    Property.rw(
      a.addType(
        intersectionType([
          fn(vector, [vector], [vector]),
          fn(vector, [n], [vector]),
        ]),
      ),
    ),
  );
  alias("Vector2", vector);
  global("Vector2", vectorStatic);
  const callableMeta = a.addType(tableType()),
    callable = cls("CallableClass", undefined, callableMeta);
  get(callableMeta, "TableType")!.props.set(
    "__call",
    Property.rw(fn(undefined, [callable, s], [n])),
  );
  alias("CallableClass", callable);
  for (const [name, key] of [
    ["IndexableClass", a.addType(unionType([s, n]))],
    ["IndexableNumericKeyClass", n],
  ] as const) {
    const ty = cls(name, undefined, a.addType(tableType()));
    get(ty, "ExternType")!.indexer = {
      indexType: key,
      indexResultType: n,
      isReadOnly: false,
    };
    alias(name, ty);
  }
  const confusing = cls("BaseClass", base);
  prop(confusing, "Method", fn(confusing, [], [s]));
  global("confusingBaseClassInstance", confusing);
  const t = a.addType(genericType({ name: "T", polarity: Polarity.Mixed }));
  const identity = a.addType(
    functionType(a.addTypePack([t]), a.addTypePack([t]), { generics: [t] }),
  );
  const genericClass = cls("ClassWithGenericMethod");
  prop(genericClass, "identity", identity, true);
  alias("ClassWithGenericMethod", genericClass);
  global("ClassWithGenericMethod", genericClass);
  for (const tf of f.globals.globalScope.exportedTypeBindings.values())
    persist(tf.type);
}

function registerRefinementExterns(f: Frontend): void {
  const { a, cls, prop, fn, alias } = helpers(f),
    root = f.builtinTypes.externType;
  const vector = cls("Vector3", root),
    instance = cls("Instance", root);
  for (const name of ["X", "Y", "Z"])
    prop(vector, name, f.builtinTypes.numberType);
  const isA = fn(
    undefined,
    [instance, f.builtinTypes.stringType],
    [f.builtinTypes.booleanType],
  );
  get(isA, "FunctionType")!.magic = {
    infer: () => false,
    refine: (ctx) => {
      const call = ctx.callSite;
      if (
        !call ||
        call.args.length !== 1 ||
        !(call.func instanceof AstExprIndexName) ||
        !(call.args[0] instanceof AstExprConstantString)
      )
        return;
      const discriminant = ctx.discriminantTypes[0];
      const tf = ctx.scope.lookupType(call.args[0].value);
      if (!discriminant || !tf) return;
      if (!get(follow(discriminant), "BlockedType"))
        throw new Error("IsA refinement requires a blocked discriminant");
      emplaceType(discriminant, boundType(tf.type));
    },
  };
  prop(instance, "Name", f.builtinTypes.stringType);
  prop(instance, "IsA", isA);
  const connection = cls("ExternScriptConnection", instance);
  prop(connection, "Disconnect", fn(undefined, [connection], []));
  const folder = cls("Folder", instance),
    part = cls("Part", instance);
  prop(part, "Position", vector);
  const optionalPart = a.addType(unionType([part, f.builtinTypes.nilType])),
    weld = cls("WeldConstraint", instance);
  prop(weld, "Part0", optionalPart);
  prop(weld, "Part1", optionalPart);
  for (const [name, ty] of [
    ["Vector3", vector],
    ["Instance", instance],
    ["ExternScriptConnection", connection],
    ["Folder", folder],
    ["Part", part],
    ["WeldConstraint", weld],
  ] as const) {
    alias(name, ty);
    persist(ty);
  }
}
