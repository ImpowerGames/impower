import { Range } from "@codemirror/state";
import { GrammarSyntaxNodeRef } from "@impower/textmate-grammar-tree/src/tree/types/GrammarSyntaxNodeRef";
import { getContextStack } from "@impower/textmate-grammar-tree/src/tree/utils/getContextStack";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { getNodesInsideParent } from "@impower/textmate-grammar-tree/src/tree/utils/getNodesInsideParent";
import { SparkdownNodeName } from "../../types/SparkdownNodeName";
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
  tokenType: SemanticTokenTypes;
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

const STDLIB_FUNCTIONS: readonly string[] = [
  "assert",
  "collectgarbage",
  "error",
  "gcinfo",
  "getfenv",
  "getmetatable",
  "ipairs",
  "loadstring",
  "newproxy",
  "next",
  "pairs",
  "pcall",
  "print",
  "rawequal",
  "rawset",
  "require",
  "select",
  "setfenv",
  "setmetatable",
  "tonumber",
  "tostring",
  "type",
  "typeof",
  "unpack",
  "xpcall",
];
const STDLIB_NAMESPACES: readonly string[] = [
  "bit32",
  "coroutine",
  "debug",
  "math",
  "os",
  "string",
  "table",
  "task",
  "utf8",
  "buffer",
  "vector",
  "system",
  "count",
  "lang",
  "plural",
];

function makeGlobalScope(): ScopeFrame {
  const frame: ScopeFrame = new Map();
  for (const n of STDLIB_FUNCTIONS)
    frame.set(n, { kind: "function", fromStdlib: true });
  for (const n of STDLIB_NAMESPACES)
    frame.set(n, { kind: "namespace", fromStdlib: true });
  return frame;
}

// Walks up from a `LuauVariableName` node and returns true if it's
// nested in a `LuauVariableAssignment_begin` subtree — meaning this
// position is the introducing site of a local-variable declaration
// (`local NAME = …`), not a downstream reference. Bounded walk so a
// pathological parent chain can't make this O(file).
function isInsideVariableAssignmentBegin(node: any): boolean {
  let cur = node?.parent;
  for (let depth = 0; depth < 6 && cur; depth++) {
    if (cur.name === "LuauVariableAssignment_begin") return true;
    if (cur.name === "LuauAccessPart") return false; // reference shape
    cur = cur.parent;
  }
  return false;
}

export class SemanticAnnotator extends SparkdownAnnotator<
  SparkdownAnnotation<SemanticInfo>
> {
  nesting = 0;

  defineName = "";

  inLinkMap = false;

  inViewField = false;

  inFunctionDeclarationParameters = false;

  inFunctionParameters = false;

  inViewDeclarationAsExpression = false;

  inViewDeclarationControlExpression = false;

  indentStack: { inScope: string[]; indent: number }[] = [];

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
    this.nesting = 0;
    this.defineName = "";
    this.inLinkMap = false;
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
    if (nodeRef.name === "FunctionDeclarationParameters") {
      this.inFunctionDeclarationParameters = true;
    }
    if (nodeRef.name === "ViewStructField") {
      this.inViewField = true;
    }
    // Leading-WS handling for the (now-dead) ViewField scoping path.
    // The grammar's `Indent` rule is gone; we detect "whitespace at
    // line start" by position. `OptionalWhitespace` is the canonical
    // class for leading-WS captures now (see whitespace taxonomy
    // comment in the grammar YAML), but accept any whitespace-class
    // node here since the dispatch is position-driven.
    if (
      (nodeRef.name === "OptionalWhitespace" ||
        nodeRef.name === "Whitespace") &&
      this.getLineAt(nodeRef.from).from === nodeRef.from
    ) {
      const currentIndentation = this.read(nodeRef.from, nodeRef.to);
      let indent = currentIndentation.length;
      if (this.inViewField) {
        while (
          this.indentStack.length > 1 &&
          indent < (this.indentStack.at(-1)?.indent ?? 0)
        ) {
          this.indentStack.pop();
        }
        if (indent > (this.indentStack.at(-1)?.indent ?? 0)) {
          this.indentStack.push({ inScope: [], indent });
        }
      } else {
        this.indentStack.length = 0;
        this.indentStack.push({ inScope: [], indent });
      }
    }
    if (nodeRef.name === "ViewDeclarationAsExpression") {
      this.inViewDeclarationAsExpression = true;
    }
    if (nodeRef.name === "ViewDeclarationControlExpression") {
      this.inViewDeclarationControlExpression = true;
    }
    if (nodeRef.name === "AccessPath") {
      if (
        this.inViewDeclarationAsExpression ||
        this.inFunctionDeclarationParameters
      ) {
        if (!this.indentStack.at(-1)) {
          this.indentStack.length = 0;
          this.indentStack.push({ inScope: [], indent: 0 });
        }
        const inScope = this.indentStack.at(-1)?.inScope;
        if (inScope) {
          const name = this.read(nodeRef.from, nodeRef.to);
          inScope.push(name);
        }
      } else {
        annotations.push(
          SparkdownAnnotation.mark<SemanticInfo>({
            tokenType: "keyword",
            possibleDivertPath: true,
          }).range(nodeRef.from, nodeRef.to),
        );
      }
    }
    if (this.inViewField) {
      if (
        !this.inViewDeclarationAsExpression &&
        !this.inViewDeclarationControlExpression
      ) {
        const inScope = this.indentStack.flatMap((s) => s.inScope);
        const name = this.read(nodeRef.from, nodeRef.to);
        if (inScope.includes(name)) {
          if (nodeRef.name === "TypeName") {
            annotations.push(
              SparkdownAnnotation.mark<SemanticInfo>({
                tokenType: "variable",
                tokenModifiers: ["readonly"],
              }).range(nodeRef.from, nodeRef.to),
            );
            const stack = getContextStack(nodeRef.node);
            const variableNameNodes = getNodesInsideParent(
              "VariableName",
              "NamespaceAccessor",
              stack,
            );
            for (const variableNameNode of variableNameNodes) {
              annotations.push(
                SparkdownAnnotation.mark<SemanticInfo>({
                  tokenType: "variable",
                }).range(variableNameNode.from, variableNameNode.to),
              );
            }
          }
        }
      }
    }
    if (nodeRef.name === "DefineVariableName") {
      const text = this.read(nodeRef.from, nodeRef.to);
      if (text) {
        this.defineName = text;
      }
    }
    if (
      nodeRef.name === "ViewStructField" ||
      nodeRef.name === "StylingStructField" ||
      nodeRef.name === "PlainStructField"
    ) {
      this.nesting++;
    }
    if (
      nodeRef.name === "ViewDeclarationObjectPropertyName" ||
      nodeRef.name === "StylingDeclarationObjectPropertyName" ||
      nodeRef.name === "PlainDeclarationObjectPropertyName"
    ) {
      if (this.nesting <= 1) {
        this.inLinkMap = false;
      }
      if (this.inLinkMap) {
        annotations.push(
          SparkdownAnnotation.mark<SemanticInfo>({
            tokenType: "struct",
          }).range(nodeRef.from, nodeRef.to),
        );
      }
    }
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
    // current scope lookup. Covers the three grammar nodes that
    // resolve to a binding:
    //   - LuauStdLibFunctions  (e.g. `print`, `unpack`)
    //   - LuauStdLibConstants  (e.g. `math`, `string` namespaces)
    //   - LuauVariableName     (regular identifiers — only emitted
    //                           when the lookup finds a binding to
    //                           override the TextMate variableName
    //                           color, e.g. a const reference that
    //                           should render as readonly).
    if (
      nodeRef.name === "LuauStdLibFunctions" ||
      nodeRef.name === "LuauStdLibConstants" ||
      nodeRef.name === "LuauVariableName"
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
        // Declaration-site marker: tag the identifier at the
        // binding location with `declaration` so editors can render
        // the introducing position differently from subsequent
        // references (e.g. underline declarations on F2-rename).
        // Detection: the LuauVariableName lives inside a
        // LuauVariableAssignment_begin subtree at the declaration
        // site; reference-site LuauVariableNames hang off a
        // LuauAccessPart instead. Walk up a bounded number of
        // parents — declarations are at most ~3 levels deep.
        if (
          nodeRef.name === "LuauVariableName" &&
          isInsideVariableAssignmentBegin(nodeRef.node)
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
    return annotations;
  }

  override leave(
    annotations: Range<SparkdownAnnotation<SemanticInfo>>[],
    nodeRef: GrammarSyntaxNodeRef<SparkdownNodeName>,
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
    if (nodeRef.name === "FunctionDeclarationParameters") {
      this.inFunctionDeclarationParameters = false;
    }
    if (nodeRef.name === "ViewStructField") {
      this.inViewField = false;
    }
    if (nodeRef.name === "ViewDeclarationAsExpression") {
      this.inViewDeclarationAsExpression = false;
    }
    if (nodeRef.name === "ViewDeclarationControlExpression") {
      this.inViewDeclarationControlExpression = false;
    }
    if (
      nodeRef.name === "DefineViewDeclaration" ||
      nodeRef.name === "DefineStylingDeclaration" ||
      nodeRef.name === "DefinePlainDeclaration"
    ) {
      this.defineName = "";
      this.inViewDeclarationAsExpression = false;
      this.inViewDeclarationControlExpression = false;
      this.inViewField = false;
      this.indentStack.length = 0;
    }
    if (
      nodeRef.name === "ViewStructField" ||
      nodeRef.name === "StylingStructField" ||
      nodeRef.name === "PlainStructField"
    ) {
      this.nesting--;
    }
    if (
      nodeRef.name === "ViewDeclarationObjectPropertyName" ||
      nodeRef.name === "StylingDeclarationObjectPropertyName" ||
      nodeRef.name === "PlainDeclarationObjectPropertyName"
    ) {
      if (this.nesting === 1) {
        if (
          !this.defineName &&
          this.read(nodeRef.from, nodeRef.to) === "link"
        ) {
          this.inLinkMap = true;
          annotations.push(
            SparkdownAnnotation.mark<SemanticInfo>({
              tokenType: "macro",
            }).range(nodeRef.from, nodeRef.to),
          );
        } else {
          this.inLinkMap = false;
        }
      }
    }
    return annotations;
  }
}
