// Checking one module, ported from the new-solver path of Luau's
// `Frontend.h`/`Frontend.cpp`; Luau is MIT-licensed (see `LICENSE-luau.txt`).
//
// `check` runs the passes in Luau's order: the data-flow graph, constraint
// generation, constraint solving, then the checker for the module's mode,
// and last the cloning of the module's public interface.

// Registers the builtin type functions every check reduces with.
import "./BuiltinTypeFunctions";
import { cloneTypeFun, TypeCloner } from "./Clone";
import { ConstraintGenerator } from "./ConstraintGenerator";
import { ConstraintGraph } from "./ConstraintGraph";
import { ConstraintSolver } from "./ConstraintSolver";
import { DataFlowGraphBuilder } from "./DataFlowGraph";
import { loadDefinitionAst, type DefinitionFile } from "./DefinitionFile";
import type { LuauTypeError } from "./Error";
import { GlobalTypes } from "./GlobalTypes";
import { Location } from "./Location";
import { Mode, Module, NullModuleResolver, type HotComment, type ModuleResolver, type RequireCycle, type SourceModule } from "./Module";
import { checkNonStrict } from "./NonStrictTypeChecker";
import { Normalizer, UnifierSharedState } from "./Normalize";
import type { Scope } from "./Scope";
import { Subtyping } from "./Subtyping";
import { BuiltinTypes, persist, type TypeId } from "./Type";
import { check as checkStrict } from "./TypeChecker2";
import { TypeFunctionRuntime, type TypeCheckLimits } from "./TypeFunction";

// Luau's `LuauTypeInferRecursionLimit` and `LuauTypeInferIterationLimit`.
const TYPE_INFER_RECURSION_LIMIT = 165;
const TYPE_INFER_ITERATION_LIMIT = 20000;

/** The mode a module's `--!` header comment selects, if any (Luau's `parseMode`). */
export function parseMode(hotcomments: readonly HotComment[]): Mode | undefined {
  for (const hc of hotcomments) {
    if (!hc.header) continue;
    if (hc.content === "nocheck") return Mode.NoCheck;
    if (hc.content === "nonstrict") return Mode.Nonstrict;
    if (hc.content === "strict") return Mode.Strict;
  }
  return undefined;
}

/**
 * Checks one parsed module in the given mode (Luau's free `check`). The
 * module's errors are in the order the passes reported them.
 */
export function check(
  sourceModule: SourceModule,
  mode: Mode,
  requireCycles: RequireCycle[],
  builtinTypes: BuiltinTypes,
  moduleResolver: ModuleResolver,
  parentScope: Scope,
  typeFunctionScope: Scope | undefined,
  prepareModuleScope: ((moduleName: string, scope: Scope) => void) | undefined,
  limits: TypeCheckLimits = {},
): Module {
  const module = new Module();
  module.checkedInNewSolver = true;
  module.name = sourceModule.name;
  module.humanReadableName = sourceModule.humanReadableName;
  module.mode = mode;
  module.root = sourceModule.root;

  const dfg = DataFlowGraphBuilder.build(sourceModule.root, module.defArena, module.keyArena);

  const unifierState = new UnifierSharedState();
  unifierState.counters.recursionLimit = TYPE_INFER_RECURSION_LIMIT;
  unifierState.counters.iterationLimit = limits.unifierIterationLimit ?? TYPE_INFER_ITERATION_LIMIT;

  const normalizer = new Normalizer(module.internalTypes, builtinTypes, unifierState);
  const typeFunctionRuntime = new TypeFunctionRuntime();
  typeFunctionRuntime.allowEvaluation = true;

  const subtyping = new Subtyping(builtinTypes, module.internalTypes, normalizer, typeFunctionRuntime);
  const cgraph = new ConstraintGraph();

  const cg = new ConstraintGenerator(
    module,
    normalizer,
    typeFunctionRuntime,
    moduleResolver,
    builtinTypes,
    parentScope,
    typeFunctionScope,
    prepareModuleScope,
    dfg,
    requireCycles,
    cgraph,
  );
  const constraintSet = cg.run(sourceModule.root);
  module.errors = [...constraintSet.errors];
  module.constraintGenerationDidNotComplete = cg.recursionLimitMet;

  const cs = new ConstraintSolver(normalizer, typeFunctionRuntime, module, moduleResolver, requireCycles, dfg, limits, constraintSet, cgraph, subtyping);
  cs.run();

  for (const e of cs.errors) module.errors.push(e);

  module.scopes.push(...cg.scopes);
  for (const [ty, contributors] of cs.upperBoundContributors) module.upperBoundContributors.set(ty, contributors);

  switch (mode) {
    case Mode.Nonstrict:
      checkNonStrict(builtinTypes, typeFunctionRuntime, unifierState, dfg, limits, sourceModule, module);
      break;
    case Mode.Definition:
    case Mode.Strict:
      checkStrict(builtinTypes, typeFunctionRuntime, unifierState, limits, sourceModule, module);
      break;
    case Mode.NoCheck:
      break;
  }

  // An incomplete solve is not worth a warning when it is the only error.
  if (module.errors.length === 1 && module.errors[0]!.data.kind === "ConstraintSolvingIncompleteError") module.errors = [];

  module.clonePublicInterface(builtinTypes);
  return module;
}

/**
 * Errors in source order, as Luau's `accumulateErrors` leaves a module's
 * errors: sorted by where they begin, with errors that begin at the same place
 * in the order they were reported.
 */
export function accumulateErrors(errors: readonly LuauTypeError[]): LuauTypeError[] {
  return errors
    .map((error, index) => ({ error, index }))
    .sort((a, b) => {
      const pa = a.error.location.begin;
      const pb = b.error.location.begin;
      if (pa.line !== pb.line) return pa.line - pb.line;
      if (pa.column !== pb.column) return pa.column - pb.column;
      return a.index - b.index;
    })
    .map((e) => e.error);
}

export interface LoadDefinitionFileResult {
  success: boolean;
  module: Module | undefined;
  parseErrors: { location: Location; message: string }[];
}

export interface CheckResult {
  module: Module;
  /** The module's errors in source order (Luau's `CheckResult::errors`). */
  errors: LuauTypeError[];
}

/**
 * The state checks share: the builtin types, the global scope and the
 * module resolver (a part of Luau's `Frontend`).
 */
export class Frontend {
  readonly builtinTypes: BuiltinTypes;
  readonly globals: GlobalTypes;
  moduleResolver: ModuleResolver = new NullModuleResolver();

  constructor(builtinTypes = new BuiltinTypes()) {
    this.builtinTypes = builtinTypes;
    this.globals = new GlobalTypes(builtinTypes);
  }

  /**
   * Loads a prepared module of `declare` statements and adds its globals and
   * exported types to `targetScope`. Definition source is parsed at build time
   * with the official parser, never while an author's document is checked.
   */
  loadDefinitionFile(globals: GlobalTypes, targetScope: Scope, definition: DefinitionFile, packageName: string): LoadDefinitionFileResult {
    const sourceModule: SourceModule = {
      name: packageName,
      humanReadableName: packageName,
      root: loadDefinitionAst(definition),
      mode: Mode.Definition,
      hotcomments: [],
      parseErrors: [],
    };
    const checkedModule = check(
      sourceModule,
      Mode.Definition,
      [],
      this.builtinTypes,
      this.moduleResolver,
      globals.globalScope,
      globals.globalTypeFunctionScope,
      undefined,
    );
    if (checkedModule.errors.length) return { success: false, module: checkedModule, parseErrors: [] };
    persistCheckedTypes(checkedModule, globals, targetScope);
    return { success: true, module: checkedModule, parseErrors: [] };
  }

  /**
   * Checks a module in its `--!` header's mode, or in `defaultMode` without
   * one. `environmentScope`, a scope below the global scope, holds names the
   * module sees in addition to the globals (Luau's module environments).
   */
  checkSourceModule(sourceModule: SourceModule, defaultMode: Mode, environmentScope?: Scope, limits: TypeCheckLimits = {}): CheckResult {
    const mode = sourceModule.mode ?? defaultMode;
    sourceModule.mode = mode;
    const module = check(
      sourceModule,
      mode,
      [],
      this.builtinTypes,
      this.moduleResolver,
      environmentScope ?? this.globals.globalScope,
      this.globals.globalTypeFunctionScope,
      undefined,
      limits,
    );
    if (mode === Mode.NoCheck) module.errors = [];
    return { module, errors: accumulateErrors(module.errors) };
  }
}

/** Clones a checked definition module's globals and exported types into the global arena and scope. */
function persistCheckedTypes(checkedModule: Module, globals: GlobalTypes, targetScope: Scope): void {
  const cloner = new TypeCloner(globals.globalTypes, globals.builtinTypes);
  const typesToPersist: TypeId[] = [];
  for (const [name, ty] of checkedModule.declaredGlobals) {
    const globalTy = cloner.clone(ty);
    targetScope.bindings.set(name, { typeId: globalTy, location: new Location() });
    typesToPersist.push(globalTy);
  }
  for (const [name, tf] of checkedModule.exportedTypeBindings) {
    const globalTf = cloneTypeFun(tf, cloner);
    targetScope.exportedTypeBindings.set(name, globalTf);
    typesToPersist.push(globalTf.type);
  }
  for (const ty of typesToPersist) persist(ty);
}
