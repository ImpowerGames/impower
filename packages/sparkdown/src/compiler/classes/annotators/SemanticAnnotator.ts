import { Range } from "@codemirror/state";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
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

  override begin(): void {
    this.scopeStack = [makeGlobalScope()];
    this.pendingDeclKind = null;
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
  bindInCurrentScope(name: string, kind: BindingKind): void {
    if (!name) return;
    const frame = this.scopeStack[this.scopeStack.length - 1];
    if (!frame) return;
    frame.set(name, { kind, fromStdlib: false });
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
          if (name) this.bindInCurrentScope(name, "function");
        }
      }
      this.scopeStack.push(new Map());
    }
    if (nodeRef.name === "LuauFunctionParameter") {
      const name = this.read(nodeRef.from, nodeRef.to).trim();
      if (name) this.bindInCurrentScope(name, "variable");
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
          this.bindInCurrentScope(name, kind);
        }
      }
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
