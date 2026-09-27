// The globals every module shares, ported from Luau's `GlobalTypes.h`/`.cpp`;
// Luau is MIT-licensed (see `LICENSE-luau.txt`).

import { makeStringMetatable } from "./BuiltinDefinitions";
import { Scope } from "./Scope";
import { emplaceType, freeTypePack, persist, PrimitiveKind, primitiveType, TypeArena, TypeFun, type BuiltinTypes } from "./Type";

export class GlobalTypes {
  readonly globalTypes = new TypeArena();
  /** Shared by all modules. */
  readonly globalScope: Scope;
  /** Shared by all modules. */
  readonly globalTypeFunctionScope: Scope;

  constructor(readonly builtinTypes: BuiltinTypes) {
    this.globalScope = Scope.root(this.globalTypes.addTypePack(freeTypePack(undefined)));
    this.globalTypeFunctionScope = Scope.root(this.globalTypes.addTypePack(freeTypePack(undefined)));

    this.globalScope.addBuiltinTypeBinding("any", new TypeFun(builtinTypes.anyType));
    this.globalScope.addBuiltinTypeBinding("nil", new TypeFun(builtinTypes.nilType));
    this.globalScope.addBuiltinTypeBinding("number", new TypeFun(builtinTypes.numberType));
    this.globalScope.addBuiltinTypeBinding("integer", new TypeFun(builtinTypes.integerType));
    this.globalScope.addBuiltinTypeBinding("string", new TypeFun(builtinTypes.stringType));
    this.globalScope.addBuiltinTypeBinding("boolean", new TypeFun(builtinTypes.booleanType));
    this.globalScope.addBuiltinTypeBinding("thread", new TypeFun(builtinTypes.threadType));
    this.globalScope.addBuiltinTypeBinding("buffer", new TypeFun(builtinTypes.bufferType));
    this.globalScope.addBuiltinTypeBinding("unknown", new TypeFun(builtinTypes.unknownType));
    this.globalScope.addBuiltinTypeBinding("never", new TypeFun(builtinTypes.neverType));

    const stringMetatableTy = makeStringMetatable(builtinTypes);
    emplaceType(builtinTypes.stringType, primitiveType(PrimitiveKind.String, stringMetatableTy));
    persist(stringMetatableTy);
  }
}
