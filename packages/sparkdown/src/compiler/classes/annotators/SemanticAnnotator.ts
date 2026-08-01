import { ChangeDesc, MapMode, Range } from "@codemirror/state";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { SyntaxNode, Tree } from "@lezer/common";
import GRAMMAR_DEFINITION from "../../../../language/sparkdown.language-grammar.json";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { SparkdownAnnotation } from "../SparkdownAnnotation";
import { SparkdownAnnotator } from "../SparkdownAnnotator";

export type SemanticTokenTypes =
  | "namespace"
  | "type"
  | "class"
  | "enum"
  | "interface"
  | "struct"
  | "typeParameter"
  | "parameter"
  | "variable"
  | "property"
  | "enumMember"
  | "event"
  | "function"
  | "method"
  | "macro"
  | "keyword"
  | "modifier"
  | "comment"
  | "string"
  | "number"
  | "regexp"
  | "operator"
  | "decorator";

export type SemanticTokenModifiers =
  | "declaration"
  | "definition"
  | "readonly"
  | "static"
  | "deprecated"
  | "abstract"
  | "async"
  | "modification"
  | "documentation"
  | "defaultLibrary";

export interface SemanticInfo {
  // The LSP-level token type to emit. Optional because annotations
  // tagged `possibleDivertPath: true` deliberately leave it unset:
  // the annotator can't decide between `function` and `class`
  // (beat) at parse time, so the LSP-side `getSemanticTokens`
  // provider resolves the path against the compiled program's
  // location maps and assigns the final token type there. Every
  // other emission site provides a `tokenType`.
  tokenType?: SemanticTokenTypes;
  tokenModifiers?: SemanticTokenModifiers[];
  possibleDivertPath?: boolean;
}

// Built-in Luau stdlib identifiers, pre-populated into the global
// scope frame so the annotator can route references through a single
// last-definition-wins rule instead of special-casing stdlib at every
// emission site. A user-declared `local print = …` then simply
// overwrites the entry in the innermost scope frame, and the
// reference path picks up the local kind automatically.
type BindingKind = "function" | "variable" | "const-variable" | "namespace";
type ScopeFrame = Map<string, { kind: BindingKind; fromStdlib: boolean }>;

// Read the stdlib identifier lists straight from the grammar
// definition so the annotator stays in sync as new builtins land.
// `LUAU_STANDARD_LIB_FUNCTIONS` populates the "function" entries;
// `LUAU_STANDARD_LIB_CONSTANTS` + `LUAU_STANDARD_LIB_GLOBALS`
// populate the "namespace" entries (the constants are dotted-access
// roots like `math` / `string`; the globals are top-level value
// names like `_G` / `_VERSION` — both behave as opaque namespace
// references at the LSP-token level).
const STDLIB_FUNCTIONS =
  (GRAMMAR_DEFINITION.variables.LUAU_STANDARD_LIB_FUNCTIONS as string[]) ?? [];
const STDLIB_NAMESPACES = [
  ...((GRAMMAR_DEFINITION.variables.LUAU_STANDARD_LIB_CONSTANTS as string[]) ??
    []),
  ...((GRAMMAR_DEFINITION.variables.LUAU_STANDARD_LIB_GLOBALS as string[]) ??
    []),
];

function makeGlobalScope(): ScopeFrame {
  const frame: ScopeFrame = new Map();
  for (const n of STDLIB_FUNCTIONS)
    frame.set(n, { kind: "function", fromStdlib: true });
  for (const n of STDLIB_NAMESPACES)
    frame.set(n, { kind: "namespace", fromStdlib: true });
  return frame;
}

// Walks up from an identifier-name node and returns true if it's
// at a declaration site — i.e. nested in either
// `LuauVariableAssignment_begin` (a `local NAME = …` binding) or
// `LuauFunctionDeclarationName` (the `function NAME(...)` introducer).
// Reference sites short-circuit on `LuauAccessPart` or
// `LuauFunctionCall_begin`, neither of which appears at declaration
// sites. Bounded walk so a pathological parent chain can't make this
// O(file).
function isAtDeclarationSite(node: any): boolean {
  let cur = node?.parent;
  for (let depth = 0; depth < 6 && cur; depth++) {
    if (cur.name === "LuauVariableAssignment_begin") return true;
    if (cur.name === "LuauFunctionDeclarationName") return true;
    if (cur.name === "LuauAccessPart") return false; // value-reference shape
    if (cur.name === "LuauFunctionCall_begin") return false; // call-site shape
    cur = cur.parent;
  }
  return false;
}

/**
 * Start of the outermost non-root node containing `pos`.
 *
 * Every lexical scope still open at `pos` begins inside that node, so a replay
 * from here reconstructs all of them. Anything before it can only have
 * contributed global bindings, which come from the cached symbol table instead.
 */
function topLevelStart(tree: Tree, pos: number): number {
  const clamped = Math.max(0, Math.min(pos, tree.length));
  let node: SyntaxNode | null = tree.resolveInner(clamped, -1);
  let outermost: SyntaxNode | null = null;
  while (node?.parent) {
    outermost = node;
    node = node.parent;
  }
  return outermost ? Math.min(outermost.from, clamped) : clamped;
}

export class SemanticAnnotator extends SparkdownAnnotator<
  SparkdownAnnotation<SemanticInfo>
> {
  // Lexical-scope stack with per-name binding kinds. Outermost frame
  // (index 0) is pre-populated with stdlib names so a reference to
  // an unshadowed `print` lands on the stdlib `function` entry while
  // a `local print = …` inside a function body adds a fresh entry to
  // the innermost frame that overrides it.
  //
  // Last-definition-wins is implicit: each scope frame is a `Map` so
  // re-declaring a name within the same scope simply overwrites the
  // earlier binding. References resolve by walking the stack
  // innermost-first; the first match becomes the kind that drives the
  // emitted LSP semantic token.
  scopeStack: ScopeFrame[] = [makeGlobalScope()];

  // Pending kind for the next `LuauVariableAssignment` we encounter
  // inside a `LuauVariableDefinition`. The grammar emits the scope
  // modifier (`local` / `store` / `const`) as a sibling captured
  // earlier in the begin pattern, so we record it on enter of the
  // LuauVariableDefinition and read it when assignments fire.
  pendingDeclKind: "variable" | "const-variable" | null = null;

  // True while `primeScopes` is replaying `enter`/`leave` to rebuild state.
  // Emission is skipped in that mode — see the guard in `enter`.
  protected priming = false;

  /**
   * Every binding that reached the GLOBAL frame, in document order.
   *
   * This is the document's top-level symbol table, and it exists so priming
   * does not have to re-walk the whole prefix to find out what is in scope.
   * Rebuilding it from the tree on every keystroke is what made priming cost
   * ~3.3x per edit event inside a large block; maintaining it incrementally
   * brings that back down, because a re-annotation window only ever invalidates
   * the declarations inside it — every other one is textually untouched.
   *
   * Kept sorted by `from` so a prime can take the prefix visible at an offset:
   * a cold pass has only bound what it has already walked past, so a reference
   * ABOVE its declaration must not resolve.
   */
  protected globalDecls: {
    from: number;
    name: string;
    kind: BindingKind;
  }[] = [];

  // Globals seen by the current real pass, in document order. Spliced into
  // `globalDecls` in `end()`, replacing whatever the window used to hold.
  protected observedGlobals: {
    from: number;
    name: string;
    kind: BindingKind;
  }[] = [];

  protected windowFrom = 0;
  protected windowTo = 0;

  /**
   * The last primed scope stack, reusable while the text in front of it is
   * unchanged.
   *
   * The symbol table removes the global half of priming, but the block-local
   * half — replaying the enclosing function's earlier `local`s — is what
   * actually dominates: an edit halfway down a 300-line block replays ~150
   * statements. Typing repeatedly in one spot re-derives an identical result
   * every keystroke.
   *
   * It is reusable more often than it looks. `editStart` is `min(reparsedFrom,
   * earliest change)`, so BY CONSTRUCTION every change in an update lands at or
   * after the window start — the prefix a prime reads is never what the edit
   * touched. So the snapshot survives until the window itself moves, or until
   * an edit reaches back before it (`mapState` drops it then).
   */
  protected primed: {
    blockStart: number;
    upTo: number;
    frames: ScopeFrame[];
    pendingDeclKind: "variable" | "const-variable" | null;
  } | null = null;

  override begin(iterateFrom: number, iterateTo: number): void {
    this.scopeStack = [makeGlobalScope()];
    this.pendingDeclKind = null;
    this.observedGlobals = [];
    this.windowFrom = iterateFrom;
    this.windowTo = iterateTo;
    if (iterateFrom > 0 && this.tree) {
      this.primeScopes(this.tree, iterateFrom);
    }
  }

  /**
   * Fold the globals this pass observed back into the cached table.
   *
   * The pass is authoritative for `[windowFrom, windowTo]` and nothing else:
   * text outside the window did not change, so the entries there still hold.
   * Replace that span and keep the rest, which preserves document order
   * because the pass walks in document order.
   */
  override end(): void {
    // Deliberately the bounds `begin` recorded, not this method's arguments:
    // `end` is handed the parser's `reparsedFrom`/`reparsedTo`, which can be
    // wider than the window that was actually iterated. Splicing on the wrong
    // span would drop declarations the pass never looked at.
    const before = this.globalDecls.filter((d) => d.from < this.windowFrom);
    const after = this.globalDecls.filter((d) => d.from > this.windowTo);
    this.globalDecls = [...before, ...this.observedGlobals, ...after];
    this.observedGlobals = [];
  }

  /**
   * Shift the cached table through an edit so its offsets stay meaningful.
   *
   * Called before the re-annotation window is computed, so `begin` reads
   * positions in the NEW document. An entry whose declaration text was deleted
   * maps to null and is dropped; if it survived after all, the pass that covers
   * the edit re-observes it.
   */
  override mapState(changes: ChangeDesc): void {
    // Drop the primed snapshot if this edit reached back in front of it; the
    // prefix it was derived from is no longer the prefix that is there.
    if (this.primed) {
      const upTo = this.primed.upTo;
      let reachedBehind = false;
      changes.iterChangedRanges((fromA, _toA, fromB) => {
        if (fromA < upTo || fromB < upTo) {
          reachedBehind = true;
        }
      });
      if (reachedBehind) {
        this.primed = null;
      }
    }
    const mapped: typeof this.globalDecls = [];
    for (const decl of this.globalDecls) {
      const from = changes.mapPos(decl.from, -1, MapMode.TrackDel);
      if (from != null) {
        mapped.push({ ...decl, from });
      }
    }
    this.globalDecls = mapped;
  }

  /**
   * Rebuild the scope state a cold pass would hold on reaching `upTo`.
   *
   * The incremental update re-annotates only a window and deletes whatever it
   * overlaps, which assumes the annotators reproduce there what a cold parse
   * would. This annotator does not, unaided: `begin` resets `scopeStack` to the
   * global frame, so a window opening inside a function body has neither the
   * document's top-level declarations nor that body's earlier `local`s bound.
   * References then fail to resolve, no token is emitted, and the old tokens —
   * which WERE inside the window — have already been deleted. They stay gone
   * until a cold parse (#326).
   *
   * Two sources of state, rebuilt separately because they cost very different
   * amounts:
   *
   * - GLOBALS come from `globalDecls`, the incrementally maintained top-level
   *   symbol table, filtered to the declarations a cold pass would already have
   *   walked past. No tree walk at all.
   * - BLOCK-LOCAL bindings — the enclosing function's parameters and its
   *   earlier `local`s — are rebuilt by replaying this annotator's own
   *   `enter`/`leave`, so the binding rules live in one place. The replay
   *   starts at the enclosing TOP-LEVEL node rather than at offset 0: every
   *   scope that could still be open at `upTo` is inside it, and everything
   *   before it only contributed globals, which we already have.
   *
   * Two details make the replay faithful:
   *
   * - `leave` is suppressed for nodes that extend past `upTo`. A cold pass has
   *   not left those yet, so their scope frames must stay open — popping them
   *   would discard exactly the enclosing-function bindings we came for.
   * - The body of a function that CLOSES before `upTo` is skipped wholesale.
   *   Entering the definition binds its name in the enclosing scope, and
   *   everything inside dies with the frame `leave` pops.
   *
   * Widening the annotate window to whole top-level nodes was tried instead and
   * measured 7x worse per keystroke; replaying from offset 0 measured ~3.3x.
   */
  protected primeScopes(tree: Tree, upTo: number): void {
    // Globals, straight from the cache — everything declared above `upTo`.
    const globals = this.scopeStack[0]!;
    for (const decl of this.globalDecls) {
      if (decl.from >= upTo) {
        break;
      }
      globals.set(decl.name, { kind: decl.kind, fromStdlib: false });
    }
    const from = topLevelStart(tree, upTo);
    if (from >= upTo) {
      return;
    }
    if (this.primed?.upTo === upTo && this.primed.blockStart === from) {
      // Same window, and nothing changed in front of it — the replay would
      // produce exactly this. Copy, because the pass about to run mutates it.
      this.scopeStack = this.primed.frames.map((frame) => new Map(frame));
      this.pendingDeclKind = this.primed.pendingDeclKind;
      return;
    }
    const discard: Range<SparkdownAnnotation<SemanticInfo>>[] = [];
    this.priming = true;
    try {
      this.replayScopes(tree, from, upTo, discard);
    } finally {
      this.priming = false;
    }
    this.primed = {
      blockStart: from,
      upTo,
      frames: this.scopeStack.map((frame) => new Map(frame)),
      pendingDeclKind: this.pendingDeclKind,
    };
  }

  private replayScopes(
    tree: Tree,
    startAt: number,
    upTo: number,
    discard: Range<SparkdownAnnotation<SemanticInfo>>[],
  ): void {
    tree.iterate({
      from: startAt,
      to: upTo,
      enter: (nodeRef) => {
        this.enter(discard, nodeRef as SparkdownSyntaxNodeRef);
        discard.length = 0;
        // Nodes still open at `upTo` are the ancestor chain of the window;
        // always descend those.
        if (nodeRef.to > upTo) {
          return undefined;
        }
        if (
          nodeRef.name === "LuauFunctionDefinition" &&
          this.pendingDeclKind === null
        ) {
          // Closed before the window: its name is already bound in the
          // enclosing scope, and every binding inside dies with the frame the
          // `leave` below pops, so the body cannot change the result.
          //
          // Only safe while no declaration is in progress. `pendingDeclKind`
          // is NOT scope-stack state, so it survives the pop: for
          // `local a = function() local g = 1 end, b = 2`, a cold pass has the
          // inner definition's `leave` clear it before `, b = 2` is reached,
          // while skipping the body would leave it set and bind `b` spuriously.
          // In that case descend and let the ordinary logic run.
          this.leave(discard, nodeRef as SparkdownSyntaxNodeRef);
          discard.length = 0;
          return false;
        }
        // NOTE: it is tempting to also skip closed subtrees whose node name is
        // not `Luau*`, on the theory that only Luau constructs bind. They do
        // not: `scene Name(param)` nests its `LuauFunctionParameter` under a
        // `Scene` node (see the `scene-with-parameters` grammar snapshot), and
        // that parameter binds into the enclosing scope. Skipping non-Luau
        // subtrees drops it and loses every token for that parameter's
        // references — the exact defect this method exists to fix. Measured at
        // ~1.6x the priming cost to descend them; correctness wins.
        return undefined;
      },
      leave: (nodeRef) => {
        // Nodes still open at `upTo` must stay open: a cold pass has not left
        // them yet, and popping their frames would discard exactly the
        // enclosing-function bindings this method exists to rebuild.
        if (nodeRef.to > upTo) {
          return;
        }
        this.leave(discard, nodeRef as SparkdownSyntaxNodeRef);
        discard.length = 0;
      },
    });
  }

  // Look up `name` in the scope stack, innermost-first. Returns the
  // binding's kind plus whether it originated from the stdlib (so
  // emit can attach the `defaultLibrary` modifier accordingly).
  lookupBinding(
    name: string,
  ): { kind: BindingKind; fromStdlib: boolean } | null {
    for (let i = this.scopeStack.length - 1; i >= 0; i--) {
      const v = this.scopeStack[i]!.get(name);
      if (v) return v;
    }
    return null;
  }

  // Record a binding in the innermost scope frame. Overwrites any
  // earlier binding of the same name in that frame (Lua's
  // last-definition-wins) and detaches it from the stdlib entry —
  // a user-declared `local print` is NEVER `defaultLibrary`, even
  // though the global scope's entry was.
  bindInCurrentScope(name: string, kind: BindingKind, from?: number): void {
    if (!name) return;
    const frame = this.scopeStack[this.scopeStack.length - 1];
    if (!frame) return;
    frame.set(name, { kind, fromStdlib: false });
    // A binding that reached the outermost frame is a global. Record it so the
    // next prime can restore it without re-walking the document. Only the real
    // pass observes: a prime is replaying bindings this table already produced.
    if (!this.priming && from != null && this.scopeStack.length === 1) {
      this.observedGlobals.push({ from, name, kind });
    }
  }

  override enter(
    annotations: Range<SparkdownAnnotation<SemanticInfo>>[],
    nodeRef: SparkdownSyntaxNodeRef,
  ): Range<SparkdownAnnotation<SemanticInfo>>[] {
    // ----- Luau lexical-scope tracking + identifier-kind emission -----
    //
    // Scope frame management: a Luau function-definition opens a new
    // lexical scope (parameters + locals declared inside don't leak).
    // The function's NAME itself (`function foo(...) … end`) registers
    // in the PARENT scope as kind "function" so call-site references
    // to `foo` outside its body resolve correctly. The push happens
    // first so subsequent enters bind into the new frame.
    if (nodeRef.name === "LuauFunctionDefinition") {
      // Bind the declared function name (if any) in the parent scope
      // before opening the new frame. Anonymous `function() … end`
      // expressions have no LuauFunctionDeclarationName; just push.
      const declName = getDescendent(
        "LuauFunctionDeclarationName",
        nodeRef.node,
      );
      if (declName) {
        const nameNode = getDescendent("LuauFunctionName", declName);
        if (nameNode) {
          const name = this.read(nameNode.from, nameNode.to).trim();
          if (name) this.bindInCurrentScope(name, "function", nodeRef.from);
        }
      }
      this.scopeStack.push(new Map());
    }
    if (nodeRef.name === "LuauFunctionParameter") {
      const name = this.read(nodeRef.from, nodeRef.to).trim();
      if (name) this.bindInCurrentScope(name, "variable", nodeRef.from);
    }
    // Variable definitions: read the scope modifier on enter
    // (`local` / `store` / `const`) so the inner
    // `LuauVariableAssignment`s know whether to mark themselves as
    // `const-variable` or plain `variable`. Sparkdown's `store`
    // creates a mutable global; `const` is read-only.
    //
    // `LuauScopeModifier` lives several layers deep in the parse
    // tree (`_begin > _c2 > LuauScopeModifier`), so use a
    // deep-descendant lookup rather than `getChild`.
    if (nodeRef.name === "LuauVariableDefinition") {
      const scopeNode = getDescendent("LuauScopeModifier", nodeRef.node);
      const scopeText = scopeNode
        ? this.read(scopeNode.from, scopeNode.to).trim()
        : "";
      this.pendingDeclKind =
        scopeText === "const" ? "const-variable" : "variable";
    }
    if (nodeRef.name === "LuauVariableAssignment" && this.pendingDeclKind) {
      // Pull the declared name from the `LuauVariableName` descendant
      // rather than parsing the leading text — the grammar wraps the
      // name inside `LuauVariableAssignment_begin > _c1 >
      // LuauVariableName`, so a top-level text match is brittle
      // (e.g. with leading whitespace).
      const nameNode = getDescendent("LuauVariableName", nodeRef.node);
      if (nameNode) {
        const name = this.read(nameNode.from, nameNode.to).trim();
        if (name) {
          // If the RHS is itself a function literal (anon fn), treat
          // the binding as "function" so references render as
          // callable. The function-literal lives deeper in the
          // assignment's subtree (under
          // `LuauAssignmentOperation_content`); use a deep search.
          let kind: BindingKind = this.pendingDeclKind;
          const fnLiteral = getDescendent(
            "LuauFunctionDefinition",
            nodeRef.node,
          );
          if (fnLiteral) kind = "function";
          this.bindInCurrentScope(name, kind, nodeRef.from);
        }
      }
    }
    // Everything above this point maintains scope state; everything below
    // only emits. `primeScopes` replays this method purely to rebuild the
    // state, so it stops here — skipping the per-node text reads and lookups
    // that would otherwise dominate the cost of walking the prefix.
    if (this.priming) {
      return annotations;
    }
    // Reference sites — emit a kind-aware semantic token based on the
    // current scope lookup. Covers the grammar nodes that resolve to
    // a binding:
    //   - LuauStdLibFunctions  (e.g. `print`, `unpack`)
    //   - LuauStdLibConstants  (e.g. `math`, `string` namespaces)
    //   - LuauVariableName     (regular identifiers — function-body
    //                           values, narrative-scope `{varName}`
    //                           interpolations, `local NAME = …`
    //                           declaration sites)
    //   - LuauFunctionName     (function declaration sites + call
    //                           sites — also reaches `& bar()` at
    //                           narrative scope where `bar` was
    //                           declared via `function bar() … end`)
    if (
      nodeRef.name === "LuauStdLibFunctions" ||
      nodeRef.name === "LuauStdLibConstants" ||
      nodeRef.name === "LuauVariableName" ||
      nodeRef.name === "LuauFunctionName"
    ) {
      const name = this.read(nodeRef.from, nodeRef.to).trim();
      const binding = this.lookupBinding(name);
      // For LuauStdLibFunctions / LuauStdLibConstants we ALWAYS emit
      // an LSP token (either the stdlib default OR the shadowed
      // local). For LuauVariableName, only emit if we have a binding
      // — otherwise let the grammar's TextMate scope handle it (the
      // identifier may not be resolvable to a known kind).
      if (binding) {
        const modifiers: SemanticTokenModifiers[] = [];
        if (binding.fromStdlib) modifiers.push("defaultLibrary");
        if (binding.kind === "const-variable") {
          // Two modifiers in tandem: `readonly` is the canonical LSP
          // signal that the identifier can't be reassigned; `static`
          // is added so themes that style the two combinations
          // distinctly (TypeScript's convention for module-level
          // constants) can render `const` references with a visibly
          // different treatment than plain `local` / `store`
          // variables. Themes that ignore `static` still get the
          // `readonly` differentiation; themes that ignore both fall
          // back to plain `variable` styling.
          modifiers.push("readonly", "static");
        }
        // Declaration-site marker: tag identifiers at their binding
        // location with `declaration` so editors can render the
        // introducing position differently from references (e.g.
        // underline declarations on F2-rename). Detection walks the
        // parent chain looking for `LuauVariableAssignment_begin` or
        // `LuauFunctionDeclarationName`; reference-site identifiers
        // short-circuit on `LuauAccessPart` (value reads) or
        // `LuauFunctionCall_begin` (call sites).
        if (
          (nodeRef.name === "LuauVariableName" ||
            nodeRef.name === "LuauFunctionName") &&
          isAtDeclarationSite(nodeRef.node)
        ) {
          modifiers.push("declaration");
        }
        const tokenType: SemanticTokenTypes =
          binding.kind === "function"
            ? "function"
            : binding.kind === "namespace"
              ? "namespace"
              : "variable";
        annotations.push(
          SparkdownAnnotation.mark<SemanticInfo>({
            tokenType,
            tokenModifiers: modifiers,
          }).range(nodeRef.from, nodeRef.to),
        );
      }
    }
    // Narrative-scope **beat** declarations: `scene NAME`,
    // `branch NAME`, and `:: NAME` label headings. "Beat" is the
    // umbrella term for narrative anchors you can divert to — the
    // grammar's `FLOW_BEAT_KEYWORDS` covers `scene`/`branch` and
    // we extend it here to include labels since they share the
    // same flow-target role. Beats render purple via the LSP
    // `class` tokenType (mapped to `sectionNameDefinition` in the
    // document-views editor theme, matching VS Code's TextMate
    // styling of `keyword.control.section.sd`). Function
    // declarations stay yellow via `function` so the two families
    // are visually distinct.
    if (
      nodeRef.name === "SceneDeclarationName" ||
      nodeRef.name === "BranchDeclarationName" ||
      nodeRef.name === "LabelDeclarationName"
    ) {
      annotations.push(
        SparkdownAnnotation.mark<SemanticInfo>({
          tokenType: "class",
          tokenModifiers: ["declaration"],
        }).range(nodeRef.from, nodeRef.to),
      );
    }
    // Narrative-scope divert paths: `-> target` / `<- target` /
    // `& target()`. The grammar tags the path segments under
    // `DivertPart` (one per dotted segment of `name.sub.path`). The
    // annotator emits an annotation with `possibleDivertPath: true`
    // and intentionally NO `tokenType` — resolution depends on the
    // full document's declaration set (forward refs, cross-file
    // includes), so `getSemanticTokens` walks the compiled program's
    // location maps and assigns the final token type: `class`
    // (purple) for beats (scene/branch/label) and `function`
    // (yellow) for functions. Unresolved paths emit no LSP token at
    // all and fall back to the grammar's TextMate scope.
    if (nodeRef.name === "DivertPart") {
      annotations.push(
        SparkdownAnnotation.mark<SemanticInfo>({
          possibleDivertPath: true,
        }).range(nodeRef.from, nodeRef.to),
      );
    }
    return annotations;
  }

  override leave(
    annotations: Range<SparkdownAnnotation<SemanticInfo>>[],
    nodeRef: SparkdownSyntaxNodeRef,
  ): Range<SparkdownAnnotation<SemanticInfo>>[] {
    if (
      nodeRef.name === "LuauFunctionDefinition" &&
      this.scopeStack.length > 1
    ) {
      // Pop the function-body scope. Keep the outermost frame so
      // top-level declarations stay visible everywhere.
      this.scopeStack.pop();
    }
    if (nodeRef.name === "LuauVariableDefinition") {
      this.pendingDeclKind = null;
    }
    return annotations;
  }
}
