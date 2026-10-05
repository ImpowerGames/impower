// Bounded named-module fixture scheduling from Luau Frontend.cpp at
// 7d5f73364fdbbaa984fa545071630eba73cfea98. This is the default
// sequential path, including the enabled flag's top-level-return eligibility.
// Eligible all-no-return SCCs require the separate combined solver.
import { AstExprCall, AstExprGlobal, AstExprTypeAssertion, AstStatReturn, visitAst, type AstExpr } from "../../compiler/typecheck/Ast";
import { accumulateErrors, check, parseMode, type CheckResult, type Frontend } from "../../compiler/typecheck/Frontend";
import { errorToStringWithContext, LuauTypeError } from "../../compiler/typecheck/Error";
import { Mode, type ModuleInfo, type ModuleResolver, type RequireCycle, type SourceModule } from "../../compiler/typecheck/Module";
import type { Location } from "../../compiler/typecheck/Location";
import type { TypePackId } from "../../compiler/typecheck/Type";

export interface NamedModuleSource {
  /** Exact original source bytes, retained beside the parsed source identity. */
  source: string;
  sourceModule: SourceModule;
}

export interface NamedModuleCheckResult extends CheckResult, NamedModuleSource {
  cyclicRequireTypeInference: boolean;
  diagnosticMessage(error: LuauTypeError): string;
}

type ResolveName = (current: string, expression: AstExpr) => ModuleInfo | undefined;
interface Edge { name: string; location: Location }

/** Checks a complete fixture graph. The resolver only reads already checked modules. */
export class NamedModuleGraph {
  private sources = new Map<string, NamedModuleSource>();
  private edges = new Map<string, Edge[]>();
  private results = new Map<string, NamedModuleCheckResult>();
  private cyclicRequireTypeInference: boolean | undefined;
  readonly resolver: ModuleResolver;

  constructor(private readonly frontend: Frontend, private readonly resolveName: ResolveName) {
    this.resolver = {
      resolveModuleInfo: resolveName,
      getModule: (name) => this.results.get(name)?.module,
      moduleExists: (name) => this.sources.has(name),
      getHumanReadableModuleName: (name) => name.replaceAll("/", "."),
    };
  }

  /** Replacing graph inputs invalidates checked dependencies as well as the entrypoint. */
  setSources(sources: readonly NamedModuleSource[]): void {
    const next = new Map<string, NamedModuleSource>();
    for (const input of sources) {
      const name = input.sourceModule.name;
      if (next.has(name)) throw new Error(`duplicate named module ${name}`);
      next.set(name, { ...input });
    }
    // Rebuild the whole bounded graph: no changed transitive dependency can
    // leave a stale exported type in a previously checked parent or cycle.
    this.results.clear();
    this.sources = next;
    this.edges.clear();
    for (const [name, input] of next) {
      const edges: Edge[] = [];
      visitAst(input.sourceModule.root, { visit: (node) => {
        // Pinned RequireTracer.cpp suppresses a require under a type assertion.
        if (node instanceof AstExprTypeAssertion) return false;
        if (node instanceof AstExprCall && node.func instanceof AstExprGlobal && node.func.name === "require" && node.args.length) {
          const info = this.resolveName(name, node.args[0]!);
          if (info) edges.push({ name: info.name, location: node.location });
        }
        return true;
      } });
      this.edges.set(name, edges);
    }
  }

  /** A dependency query never starts a second check or manufactures a result. */
  getResult(name: string): NamedModuleCheckResult | undefined {
    return this.results.get(name);
  }

  getReturnPack(name: string): TypePackId {
    const module = this.getResult(name)?.module;
    if (!module?.returnType) throw new Error(`named module ${name} has no checked return pack`);
    return module.returnType;
  }

  check(entry: string, defaultMode = Mode.Strict, cyclicRequireTypeInference = false): NamedModuleCheckResult {
    if (!this.sources.has(entry)) throw new Error(`unknown entry module ${entry}`);
    const order: string[] = [];
    const marks = new Map<string, "temporary" | "permanent">();
    const schedule = (name: string): void => {
      if (!this.sources.has(name) || marks.has(name)) return;
      marks.set(name, "temporary");
      // Frontend::parseGraph pushes requireSet children onto a LIFO stack.
      const dependencies = [...new Set((this.edges.get(name) ?? []).map((edge) => edge.name))];
      for (let i = dependencies.length - 1; i >= 0; i--) schedule(dependencies[i]!);
      marks.set(name, "permanent");
      order.push(name);
    };
    schedule(entry);
    if (this.cyclicRequireTypeInference !== cyclicRequireTypeInference) this.results.clear();
    this.cyclicRequireTypeInference = cyclicRequireTypeInference;
    if (cyclicRequireTypeInference) {
      // Pinned computeSCCs excludes a whole cyclic component if any member
      // has a top-level return. Return statements inside functions do not count.
      for (const component of this.cyclicComponents(order)) {
        if (component.every((name) => !this.hasTopLevelReturn(name)))
          throw new Error(`all-no-return cyclic named module component requires the separate SCC solver path: ${component.join(", ")}`);
      }
    }
    // A default-mode change is a graph change too: cached parents may contain
    // the public interface inferred under the dependency's previous mode.
    if (order.some((name) => {
      const source = this.sources.get(name)!.sourceModule;
      const mode = parseMode(source.hotcomments) ?? source.mode ?? defaultMode;
      const cached = this.results.get(name);
      return cached && cached.module.mode !== mode;
    })) this.results.clear();
    this.frontend.moduleResolver = this.resolver;
    for (const name of order) {
      const source = this.sources.get(name)!.sourceModule;
      const mode = parseMode(source.hotcomments) ?? source.mode ?? defaultMode;
      const cached = this.results.get(name);
      if (cached?.module.mode === mode) continue;
      const cycles = this.requireCycles(name);
      const module = check(source, mode, cycles, this.frontend.builtinTypes, this.resolver,
        this.frontend.globals.globalScope, this.frontend.globals.globalTypeFunctionScope, undefined);
      if (mode === Mode.NoCheck) module.errors = [];
      else for (const cycle of cycles) {
        // Frontend.cpp1937-1949 keeps only unavailable or top-level-return
        // members when the flag is enabled. This does not alter solver metadata.
        const reported = cyclicRequireTypeInference
          ? cycle.path.filter((member) => !this.sources.has(member) || this.hasTopLevelReturn(member))
          : cycle.path;
        module.errors.push(new LuauTypeError(cycle.location, { kind: "ModuleHasCyclicDependency", cycle: [...reported] }, name));
      }
      this.results.set(name, { ...this.sources.get(name)!, module, errors: accumulateErrors([...source.parseErrors, ...module.errors]),
        cyclicRequireTypeInference, diagnosticMessage: (error) => errorToStringWithContext(error, { cyclicRequireTypeInference }) });
    }
    return this.results.get(entry)!;
  }

  private hasTopLevelReturn(name: string): boolean {
    return this.sources.get(name)!.sourceModule.root.body.some((stat) => stat instanceof AstStatReturn);
  }

  /** Partition the reachable graph using its DFS finishing order and transpose. */
  private cyclicComponents(order: readonly string[]): string[][] {
    const reverse = new Map(order.map((name) => [name, [] as string[]]));
    for (const name of order)
      for (const edge of this.edges.get(name) ?? []) reverse.get(edge.name)?.push(name);
    const seen = new Set<string>();
    const components: string[][] = [];
    for (const start of [...order].reverse()) {
      if (seen.has(start)) continue;
      const component: string[] = [], pending = [start];
      while (pending.length) {
        const name = pending.pop()!;
        if (seen.has(name)) continue;
        seen.add(name);
        component.push(name);
        pending.push(...reverse.get(name)!);
      }
      if (component.length > 1 || (this.edges.get(start) ?? []).some((edge) => edge.name === start)) components.push(component);
    }
    return components;
  }

  /** One first DFS cycle per require location, retaining the pinned path direction. */
  requireCycles(start: string): RequireCycle[] {
    const cycles: RequireCycle[] = [];
    const seen = new Set<string>();
    for (const edge of this.edges.get(start) ?? []) {
      const path: string[] = [];
      const search = (name: string): string[] | undefined => {
        if (!this.sources.has(name) || seen.has(name)) return undefined;
        seen.add(name);
        path.push(name);
        for (const child of this.edges.get(name) ?? []) {
          const cycle = search(child.name);
          if (cycle) return cycle;
        }
        // Pinned getRequireCycles recognizes the start on postorder processing.
        if (name === start) return [...path];
        path.pop();
        return undefined;
      };
      const pathToStart = search(edge.name);
      if (pathToStart) {
        cycles.push({ location: edge.location, path: pathToStart });
        seen.clear();
      }
    }
    return cycles;
  }
}
