// Side-effect import to stabilize the inkjs engine module load order.
// `engine/Container.ts` ↔ `engine/Value.ts` ↔ `engine/Object.ts` form a
// dependency cycle; if `Object.ts` is the first to load, `Value.ts`
// resolves `InkObject` as undefined when extending it. Forcing
// `Container.ts` to be the entry point evaluates `Value.ts` (and
// therefore `Object.ts`) in an order that breaks the cycle cleanly.
// The now-removed `Compiler` import used to do this implicitly; this
// explicit import preserves the load order in its place.
import "../../../inkjs/engine/Container";
import { Range } from "@codemirror/state";
import { ErrorType } from "../../../inkjs/compiler/Parser/ErrorType";
import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { SourceMetadata } from "../../../inkjs/engine/Error";
import { lower } from "../../lower/lower";
import { type SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { SparkdownAnnotation } from "../SparkdownAnnotation";
import { SparkdownAnnotator } from "../SparkdownAnnotator";

let id = 1;
const generateUUID = () => {
  return `${id++}`;
};

export interface InkDiagnostic {
  message: string;
  severity: ErrorType;
  source: SourceMetadata | null;
  // Optional LSP `DiagnosticTag` values (1 = Unnecessary, 2 = Deprecated).
  // The Unnecessary tag is what VS Code uses to render diagnostics
  // faded out — used here for unreachable code after `done` / `fin`.
  tags?: number[];
}

export interface CompiledBlock {
  diagnostics?: InkDiagnostic[];
  content?: ParsedObject[];
  include?: string;
  // Path (without `.luau` extension) for a `run "path"` statement.
  // Compiler resolves the file, wraps its body in a function-call
  // knot, and emits an invocation. See SparkdownCompiler's `run`
  // handling.
  run?: string;
  context?: {
    [type: string]: { [name: string]: any };
  };
  // Reactive Sparkle UI AST contributed by a screen/component block, merged
  // into `program.sparkle` (docs/sparkle/reactive-sparkle-spec.md §6). Additive
  // and not yet consumed by the engine.
  sparkle?: {
    screens?: { [name: string]: any };
    components?: { [name: string]: any };
  };
  defaultDefinitions?: { [type: string]: any };
  json?: string;
  uuid?: string;
  // Synthetic top-level knots produced by anonymous function literals
  // inside this chunk. The compile pipeline appends them to the
  // story's `topLevelFlowBaseObjs` so the `DivertTarget(__anon_fn_…)`
  // references emitted at the literal's source position can resolve.
  hoistedKnots?: ParsedObject[];
}

export interface CompilationConfig {
  definitions?: {
    builtins?: {
      [type: string]: {
        [name: string]: any;
      };
    };
  };
}

export class CompilationAnnotator extends SparkdownAnnotator<
  SparkdownAnnotation<CompiledBlock>,
  CompilationConfig
> {
  // Cache the globally-addressable callable names per parse tree.
  // Computed lazily by walking the top-level statements once: every
  // `LuauExternalDeclaration` and every top-level `LuauFunctionDefinition`
  // / `LuauVariableDefinition` lands in the set. Used by
  // `scanFreeVariables` in `lowerExpression.ts` to skip these when
  // collecting closure upvals — they're already reachable from any
  // nested-function call site via the regular divert resolver, so
  // routing them through closure dispatch would waste a frame slot
  // and (for externals) break the call entirely.
  //
  // Keyed on the Tree reference: the SparkdownAnnotator base class
  // reassigns `this.tree` whenever an incremental parse produces a
  // new top-node, so identity-based comparison correctly invalidates
  // the cache on real structural changes.
  private _globalCallableNames?: Set<string>;
  private _globalCallableNamesTree?: unknown;

  private computeGlobalCallableNames(): Set<string> {
    if (this.tree === this._globalCallableNamesTree && this._globalCallableNames) {
      return this._globalCallableNames;
    }
    const set = new Set<string>();
    const tree = this.tree;
    if (tree) {
      const cursor = tree.cursor();
      // Only walk top-level children — nested declarations are scoped
      // inside their parent function and don't need to be in the
      // global skip-set. `cursor.firstChild()` descends to the first
      // child of the root; `cursor.nextSibling()` iterates the rest.
      if (cursor.firstChild()) {
        do {
          this.collectGlobalNameAt(cursor.node, set);
        } while (cursor.nextSibling());
      }
    }
    this._globalCallableNames = set;
    this._globalCallableNamesTree = this.tree;
    return set;
  }

  private collectGlobalNameAt(
    node: import("@lezer/common").SyntaxNode,
    set: Set<string>,
  ): void {
    if (node.name === "LuauExternalDeclaration") {
      const content = node.getChild("LuauExternalDeclaration_content");
      const target = content ?? node;
      const found = this.findDescendant(target, "LuauFunctionName");
      if (found) set.add(this.read(found.from, found.to).trim());
      return;
    }
    if (node.name === "LuauFunctionDefinition") {
      const found = this.findDescendant(node, "LuauFunctionName");
      if (found) set.add(this.read(found.from, found.to).trim());
      return;
    }
    if (node.name === "LuauVariableDefinition") {
      // Top-level `store NAME = …` / `const NAME = …` — collect the
      // declared identifier(s). Each `LuauVariableAssignment` carries
      // one name in `LuauVariableName` under `_begin_c1`.
      let cur = node.firstChild;
      while (cur) {
        if (cur.name === "LuauVariableDefinition_content") {
          let inner = cur.firstChild;
          while (inner) {
            if (inner.name === "LuauVariableAssignment") {
              const nameNode = this.findDescendant(inner, "LuauVariableName");
              if (nameNode) set.add(this.read(nameNode.from, nameNode.to).trim());
            }
            inner = inner.nextSibling;
          }
        }
        cur = cur.nextSibling;
      }
    }
  }

  private findDescendant(
    node: import("@lezer/common").SyntaxNode,
    name: string,
  ): import("@lezer/common").SyntaxNode | null {
    let result: import("@lezer/common").SyntaxNode | null = null;
    const cursor = node.cursor();
    if (!cursor.firstChild()) return null;
    do {
      if (cursor.name === name) {
        result = cursor.node;
        break;
      }
      const found = this.findDescendant(cursor.node, name);
      if (found) {
        result = found;
        break;
      }
    } while (cursor.nextSibling());
    return result;
  }

  override enter(
    annotations: Range<SparkdownAnnotation<CompiledBlock>>[],
    nodeRef: SparkdownSyntaxNodeRef,
  ): Range<SparkdownAnnotation<CompiledBlock>>[] {
    if (
      nodeRef.node.parent?.type.isTop &&
      nodeRef.name !== "Newline" &&
      nodeRef.name !== "Whitespace" &&
      nodeRef.name !== "ExtraWhitespace" &&
      nodeRef.name !== "OptionalWhitespace" &&
      nodeRef.name !== "RequiredWhitespace" &&
      nodeRef.name !== "FrontMatter"
    ) {
      // Snapshot the chunk's absolute start line so the lowerer can produce
      // chunk-relative debug metadata. `text.lineAt(pos).number` is 1-based,
      // so subtract 1 to get a 0-based absolute line. The 0-based chunk-
      // relative line is `(absolute-line) - (chunk-start-absolute-line)`.
      // Compiler's `offsetDebugMetadata` later re-adds the chunk offset.
      const text = this.text;
      const chunkStartLine0 = text ? text.lineAt(nodeRef.from).number - 1 : 0;
      // Fresh per-chunk hoist list — accumulated synthetic knots from
      // anonymous-function literals during this chunk's lowering. Each
      // chunk's `enter` reruns from scratch (rebuilt on edit), so a
      // chunk-local list naturally tracks the chunk's current state.
      // Names use the source position rather than a counter, so they
      // stay unique across chunks and stable across edits.
      const hoistedKnots: ParsedObject[] = [];
      // Stack of nested-callable buffers. Starts empty (top-level
      // scope). Function-definition lowerers push/pop their own buffer
      // so nested callables (anonymous fns, nested named fns) live at
      // their lexical position instead of hoisting to top-level.
      const functionScopeStack: ParsedObject[][] = [];
      // Stack of break/continue targets used by `break` and
      // `continue` lowerers to emit the right `Divert`. Each loop
      // pushes/pops its own entry.
      const loopStack: { continueLabel: string; breakLabel: string }[] = [];
      // Diagnostics collected by lowerers nested below the chunk's
      // dispatch level. They're attached to the chunk's annotation
      // after lowering completes — `appendBlockContent` in
      // `lowerStatements` doesn't propagate per-block diagnostics, so
      // nested lowerers route through this buffer instead.
      const chunkDiagnostics: InkDiagnostic[] = [];
      // Fresh per-chunk stack of declared-locals frames. Pushed/popped
      // by `lowerLuauFunctionDefinition` (and the anonymous-fn lowerer)
      // so nested-scope scans of free variables can detect shadowing
      // of stdlib-named identifiers by enclosing-scope locals.
      const declaredLocalsStack: Set<string>[] = [];
      // Per-chunk stack of hoist buffers — one entry pushed per
      // enclosing function-definition lowering. Bare `function NAME end`
      // nested inside another function pre-declares a `local NAME = nil`
      // here so it lands at the enclosing function's body top, surviving
      // any do/while/for/if block scopes that wrap the in-place
      // assignment.
      const hoistedNestedFnDeclsStack: ParsedObject[][] = [];
      // Per-chunk stack of "sibling subflow" names — nested function
      // declarations that route through `lowerNestedAsSubFlow` (variadic
      // fns) rather than emitting a local-binding closure. References to
      // these names from inner closures must skip upval capture so the
      // call site resolves via FunctionCall + static `PackTuple`.
      const siblingSubFlowNamesStack: Set<string>[] = [];
      const lowered = lower(nodeRef, {
        read: (from, to) => this.read(from, to),
        lineNumber: (pos) =>
          text ? text.lineAt(pos).number - 1 - chunkStartLine0 : 0,
        characterNumber: (pos) => {
          if (!text) return 0;
          const line = text.lineAt(pos);
          return pos - line.from;
        },
        config: this.config,
        hoistedKnots,
        functionScopeStack,
        loopStack,
        diagnostics: chunkDiagnostics,
        globalCallableNames: this.computeGlobalCallableNames(),
        declaredLocalsStack,
        hoistedNestedFnDeclsStack,
        siblingSubFlowNamesStack,
      });
      if (lowered && hoistedKnots.length > 0) {
        lowered.hoistedKnots = hoistedKnots;
      }
      if (lowered && chunkDiagnostics.length > 0) {
        // Merge any deep-nested-lowerer diagnostics with whatever
        // diagnostics the chunk-level lowerer attached directly.
        lowered.diagnostics = [
          ...(lowered.diagnostics ?? []),
          ...chunkDiagnostics,
        ];
      }
      if (lowered !== undefined) {
        // Tag-only chunks need a stable per-chunk container so the
        // runtime's `TagsForContentAtPath` walker stops at the right
        // boundary. The `uuid` field tells `SparkdownCompiler` to
        // wrap the chunk's content in a `Statement` — without that
        // wrap, the tag-triplet would land flat in the enclosing
        // container alongside the next chunk's line-type tag, and the
        // walker would over-collect into the next line's metadata.
        if (nodeRef.name === "Tags") {
          lowered.uuid = generateUUID();
        }
        annotations.push(
          SparkdownAnnotation.mark(lowered).range(nodeRef.from, nodeRef.to),
        );
      }
      // Chunks the lowerer doesn't recognize are silently dropped.
      // There is no parser fallback for unrecognized chunks (the
      // grammar+lowerers are the only path); dropping them avoids
      // re-interpreting Luau-tagged source as legacy ink (e.g. `{ a = 1 }`
      // table literals look like ink `{interpolation}` blocks) and the
      // misleading diagnostics that would follow. If a chunk shape needs
      // handling, add a lowerer for it in `src/compiler/lower/lower.ts`.
    }
    return annotations;
  }

  override end(
    iterateFrom: number,
    iterateTo: number,
    added: Range<SparkdownAnnotation<CompiledBlock>>[],
    removed: Range<SparkdownAnnotation<CompiledBlock>>[],
  ): void {
    for (let i = 0; i < added.length; i++) {
      const add = added[i]!;
      const remove = removed[i];
      if (add.value.type.uuid != null) {
        if (add?.value.type.json === remove?.value.type.json) {
          // No change, carry forward uuid
          add.value.type.uuid = remove?.value.type.uuid ?? generateUUID();
        } else {
          // The compiled json has changed, generate a new uuid
          add.value.type.uuid = generateUUID();
        }
      }
    }
  }
}
