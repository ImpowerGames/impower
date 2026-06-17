import { Range } from "@codemirror/state";
import { getContextNames } from "@impower/textmate-grammar-tree/src/tree/utils/getContextNames";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { SparkDeclaration } from "../../types/SparkDeclaration";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { SparkSelector } from "../../types/SparkSelector";
import { sortFilteredName } from "../../utils/sortFilteredName";
import { SparkdownAnnotation } from "../SparkdownAnnotation";
import { SparkdownAnnotator } from "../SparkdownAnnotator";

export interface Reference {
  usage?: "divert";
  declaration?:
    | "function"
    | "scene"
    | "branch"
    | "label"
    | "const"
    | "var"
    | "define"
    | "define_type_name"
    | "define_variable_name"
    | "param"
    | "property"
    | "character_name";
  kind?: "write" | "read";
  symbolIds?: string[];
  interdependentIds?: string[];
  firstMatchOnly?: boolean;
  selectors?: SparkSelector[];
  assigned?: SparkDeclaration;
  prop?: boolean;
  linkable?: boolean;
  stylingStringIdentifier?: boolean;
}

// Bounded parent walk: nearest ancestor whose name is in `names`, else null.
function ancestorMatching(
  node: { parent?: any } | undefined,
  names: Set<string>,
  max = 10,
): any {
  let cur = node?.parent;
  for (let depth = 0; depth < max && cur; depth++) {
    if (names.has(cur.name)) return cur;
    cur = cur.parent;
  }
  return null;
}

// DFS in-order: first descendant (or self) whose name is in `names`, else null.
function firstDescendant(node: any, names: Set<string>): any {
  if (names.has(node.name)) return node;
  let c = node.firstChild;
  while (c) {
    const found = firstDescendant(c, names);
    if (found) return found;
    c = c.nextSibling;
  }
  return null;
}

const FUNCTION_DECL_NAME = new Set(["LuauFunctionDeclarationName"]);
const FUNCTION_DEFINITION = new Set(["LuauFunctionDefinition"]);
const VARIABLE_DECL_SITE = new Set(["LuauVariableAssignment_begin"]);
const VARIABLE_DEFINITION = new Set(["LuauVariableDefinition"]);

// The OOP define property line (`store trust = 0`, `name = "RAFFLES"`). Its LHS
// name LuauVariableName must be claimed as a `property` declaration by the
// LuauPropertyDefinition branch, NOT emitted as a generic variable read.
const PROPERTY_DEFINITION = new Set(["LuauPropertyDefinition"]);

// `LuauStructBodyLine` is the per-physical-line wrapper of a structural
// (style/screen/component/animation/theme) body; the indent is the column of
// the body content relative to that line's start.
const STRUCT_BODY_LINE = new Set(["LuauStructBodyLine"]);

// The identifier tokens that carry a struct property/header KEY in the Luau-port
// grammar (LuauStructScalarProperty / LuauStructObjectHeader capture-2). The old
// per-flavor `*DeclarationScalarPropertyName` / `*ObjectPropertyName` nodes are
// gone; these are the generic replacements.
const STRUCT_KEY_TOKENS = new Set([
  "BuiltinComponentName",
  "StylingDeclarationScalarPropertyName",
  "DeclarationScalarPropertyKey",
  "CustomComponentName",
  "ComponentName",
  "PropertyName",
  "SelectorPropertyNamePart",
]);

// Top-level structural-define keyword nodes → the engine type they declare.
// Their `name` (LuauDefineName) is an INSTANCE under that type, and a trailing
// `as PARENT` is `$extends` (a sibling of the SAME type), not the type itself.
const STRUCTURAL_TYPE_BY_NODE: Record<string, string> = {
  LuauStyle: "style",
  LuauScreen: "screen",
  LuauComponent: "component",
  LuauAnimation: "animation",
  LuauTheme: "theme",
};

export class ReferenceAnnotator extends SparkdownAnnotator<
  SparkdownAnnotation<Reference>
> {
  // The engine type of the define currently being walked. For an OOP `define
  // <name> as <parent>` this is the PARENT (the inverted model: parent = type);
  // for a root `define <name> with …` it is the name itself; for a structural
  // block it is the keyword (style/screen/component/animation/theme).
  defineType = "";

  // The instance name of the current define (`$default` for a root define, whose
  // properties live under `context.<type>.$default`).
  defineName = "";

  // True while inside a structural (style/screen/…) block — distinguishes the
  // struct-body property syntax from the OOP `LuauPropertyDefinition` syntax and
  // marks a trailing `as PARENT` as `$extends` rather than the type.
  inStructural = false;

  // OOP only: whether the current `define` has a parent (`as PARENT`). Drives
  // whether the name is a type declaration (root) or an instance (typed).
  oopHasParent = false;

  // OOP typed defines emit `<name>` BEFORE `<parent>` in source order, but the
  // name's symbolId is `<parent>.<name>`, so its emission is deferred until the
  // parent is known.
  pendingOOPName: { from: number; to: number; name: string } | null = null;

  // Indentation path stack for a structural struct body. Each frame records the
  // body-content column + the path key (property name, or array index); deeper
  // lines nest, same-or-shallower lines pop. Mirrors lowerStructBodyTyped's
  // indentation reader, but incrementally over enter().
  structPathStack: { indent: number; key: string | number; arrayLength?: number }[] =
    [];

  divertPathParts: string[] = [];

  override begin() {
    this.defineType = "";
    this.defineName = "";
    this.inStructural = false;
    this.oopHasParent = false;
    this.pendingOOPName = null;
    this.structPathStack = [];
    this.divertPathParts = [];
  }

  private resetDefineState() {
    this.defineType = "";
    this.defineName = "";
    this.inStructural = false;
    this.oopHasParent = false;
    this.pendingOOPName = null;
    this.structPathStack = [];
  }

  // The `{types:[type], name:"$default", …}` selector a define-type reference
  // carries so go-to-definition / hover can resolve the type's default struct.
  private typeNameSelector(type: string): SparkSelector[] {
    return [
      {
        types: [type],
        name: "$default",
        displayType: "type",
        displayName: type,
      },
    ];
  }

  override enter(
    annotations: Range<SparkdownAnnotation<Reference>>[],
    nodeRef: SparkdownSyntaxNodeRef,
  ): Range<SparkdownAnnotation<Reference>>[] {
    if (nodeRef.name === "LuauFunctionName") {
      // `LuauFunctionName` fires at both the declaration (`function NAME(...)`,
      // under LuauFunctionDeclarationName) and call/read sites (`& NAME()`).
      const isDeclaration = !!ancestorMatching(
        nodeRef.node,
        FUNCTION_DECL_NAME,
      );
      annotations.push(
        SparkdownAnnotation.mark<Reference>({
          ...(isDeclaration ? { declaration: "function" } : {}),
          symbolIds: [this.read(nodeRef.from, nodeRef.to)],
          kind: isDeclaration ? "write" : "read",
        }).range(nodeRef.from, nodeRef.to),
      );
      return annotations;
    }
    if (nodeRef.name === "SceneDeclarationName") {
      annotations.push(
        SparkdownAnnotation.mark<Reference>({
          declaration: "scene",
          symbolIds: [this.read(nodeRef.from, nodeRef.to)],
          kind: "write",
        }).range(nodeRef.from, nodeRef.to),
      );
      return annotations;
    }
    if (nodeRef.name === "BranchDeclarationName") {
      annotations.push(
        SparkdownAnnotation.mark<Reference>({
          declaration: "branch",
          symbolIds: ["." + this.read(nodeRef.from, nodeRef.to)],
          kind: "write",
        }).range(nodeRef.from, nodeRef.to),
      );
      return annotations;
    }
    if (nodeRef.name === "LabelDeclarationName") {
      annotations.push(
        SparkdownAnnotation.mark<Reference>({
          declaration: "label",
          symbolIds: ["." + this.read(nodeRef.from, nodeRef.to)],
          kind: "write",
        }).range(nodeRef.from, nodeRef.to),
      );
      return annotations;
    }
    if (nodeRef.name === "LuauFunctionParameter") {
      // Scope the param symbol under its enclosing function's name, matching
      // the pre-port `funcName.param` id. The name lives at
      // LuauFunctionDefinition > LuauFunctionDeclarationName > LuauFunctionName.
      const definition = ancestorMatching(nodeRef.node, FUNCTION_DEFINITION);
      const declName = definition
        ? getDescendent("LuauFunctionDeclarationName", definition)
        : null;
      const functionNameNode = declName
        ? getDescendent("LuauFunctionName", declName)
        : null;
      const fnName = functionNameNode
        ? this.read(functionNameNode.from, functionNameNode.to).trim()
        : "";
      annotations.push(
        SparkdownAnnotation.mark<Reference>({
          declaration: "param",
          symbolIds: [
            fnName
              ? `${fnName}.${this.read(nodeRef.from, nodeRef.to).trim()}`
              : this.read(nodeRef.from, nodeRef.to).trim(),
          ],
          kind: "write",
        }).range(nodeRef.from, nodeRef.to),
      );
      return annotations;
    }
    if (nodeRef.name === "DivertPart") {
      this.divertPathParts.push(this.read(nodeRef.from, nodeRef.to));
      return annotations;
    }
    if (nodeRef.name === "DivertPartName") {
      // NOTE: divertPathParts also includes . separator as a part
      const divertPath = this.divertPathParts.join("");
      annotations.push(
        SparkdownAnnotation.mark<Reference>({
          usage: "divert",
          symbolIds: ["." + divertPath, divertPath],
          firstMatchOnly: true,
          kind: "read",
        }).range(nodeRef.from, nodeRef.to),
      );
      return annotations;
    }

    // ----- Define declarations (the Luau-port, inverted model) -----------------
    //
    // OOP `define <name> as <parent>` : type = parent, instance = name.
    // OOP `define <name> with …`       : root define, name IS the type.
    // structural `style/screen/component/animation/theme <name> [as <extends>]` :
    //   type = keyword, instance = name, trailing `as` = `$extends` (same type).
    if (nodeRef.name === "LuauDefine") {
      this.resetDefineState();
      this.inStructural = false;
      this.oopHasParent = !!getDescendent("LuauDefineParentName", nodeRef.node);
      return annotations;
    }
    if (STRUCTURAL_TYPE_BY_NODE[nodeRef.name]) {
      this.resetDefineState();
      this.inStructural = true;
      this.defineType = STRUCTURAL_TYPE_BY_NODE[nodeRef.name]!;
      return annotations;
    }
    if (nodeRef.name === "LuauDefineName") {
      const name = this.read(nodeRef.from, nodeRef.to).trim();
      if (this.inStructural) {
        // Structural instance: `<keyword>.<name>` (e.g. `style.my_button`).
        this.defineName = name;
        annotations.push(
          SparkdownAnnotation.mark<Reference>({
            declaration: "define_variable_name",
            symbolIds: [`${this.defineType}.${name}`],
            kind: "write",
            linkable: true,
          }).range(nodeRef.from, nodeRef.to),
        );
        return annotations;
      }
      if (!this.oopHasParent) {
        // Root OOP define: the name IS the declared type. Properties live under
        // `<type>.$default`.
        this.defineType = name;
        this.defineName = "$default";
        annotations.push(
          SparkdownAnnotation.mark<Reference>({
            declaration: "define_type_name",
            symbolIds: [name],
            kind: "write",
            selectors: this.typeNameSelector(name),
          }).range(nodeRef.from, nodeRef.to),
        );
        return annotations;
      }
      // Typed OOP define: defer the name until the parent (= type) is known.
      this.defineName = name;
      this.pendingOOPName = { from: nodeRef.from, to: nodeRef.to, name };
      return annotations;
    }
    if (nodeRef.name === "LuauDefineParentName") {
      const parent = this.read(nodeRef.from, nodeRef.to).trim();
      if (this.inStructural) {
        // `as PARENT` on a structural block is `$extends` — a read reference to
        // another define of the SAME type (e.g. `animation X as Y` → animation.Y).
        annotations.push(
          SparkdownAnnotation.mark<Reference>({
            symbolIds: [`${this.defineType}.${parent}`],
            kind: "read",
            linkable: true,
          }).range(nodeRef.from, nodeRef.to),
        );
        return annotations;
      }
      // OOP typed define: the parent IS the engine type.
      this.defineType = parent;
      annotations.push(
        SparkdownAnnotation.mark<Reference>({
          declaration: "define_type_name",
          symbolIds: [parent],
          kind: "write",
          selectors: this.typeNameSelector(parent),
        }).range(nodeRef.from, nodeRef.to),
      );
      if (this.pendingOOPName) {
        annotations.push(
          SparkdownAnnotation.mark<Reference>({
            declaration: "define_variable_name",
            symbolIds: [`${parent}.${this.pendingOOPName.name}`],
            kind: "write",
            linkable: true,
          }).range(this.pendingOOPName.from, this.pendingOOPName.to),
        );
        this.pendingOOPName = null;
      }
      return annotations;
    }

    // ----- OOP define property (`store trust = 0`, `name = "RAFFLES"`) ---------
    if (nodeRef.name === "LuauPropertyDefinition") {
      const begin = getDescendent("LuauVariableAssignment_begin", nodeRef.node);
      const nameNode = begin
        ? getDescendent("LuauVariableName", begin)
        : getDescendent("LuauVariableName", nodeRef.node);
      if (nameNode) {
        const propName = this.read(nameNode.from, nameNode.to).trim();
        annotations.push(
          SparkdownAnnotation.mark<Reference>({
            declaration: "property",
            symbolIds: [`${this.defineType}.${this.defineName}.${propName}`],
            kind: "write",
          }).range(nameNode.from, nameNode.to),
        );
        // A character's `name = "X"` value is the cross-reference target a
        // dialogue cue (`X:`) resolves to via `character.?.name=X`.
        if (this.defineType === "character" && propName === "name") {
          const stringNode = getDescendent(
            "LuauDoubleQuotedString",
            nodeRef.node,
          );
          const contentNode = stringNode
            ? getDescendent("LuauDoubleQuotedString_content", stringNode)
            : null;
          if (contentNode) {
            const value = this.read(contentNode.from, contentNode.to);
            annotations.push(
              SparkdownAnnotation.mark<Reference>({
                declaration: "character_name",
                symbolIds: ["character.?.name=" + value],
              }).range(contentNode.from, contentNode.to),
            );
          }
        }
      }
      return annotations;
    }

    // ----- Structural struct-body property lines -------------------------------
    if (
      nodeRef.name === "LuauStructScalarProperty" ||
      nodeRef.name === "LuauStructObjectHeader" ||
      nodeRef.name === "LuauStructArrayItem"
    ) {
      const bodyLine = ancestorMatching(nodeRef.node, STRUCT_BODY_LINE, 6);
      const indent = bodyLine ? nodeRef.from - bodyLine.from : 0;
      // Pop siblings + deeper frames so the stack reflects this line's parents.
      while (
        this.structPathStack.length > 0 &&
        this.structPathStack[this.structPathStack.length - 1]!.indent >= indent
      ) {
        this.structPathStack.pop();
      }

      if (nodeRef.name === "LuauStructArrayItem") {
        // `-` array item: no referenceable name; push an index frame so nested
        // properties get a stable path. Index comes from the parent container.
        const parent = this.structPathStack[this.structPathStack.length - 1];
        let index = 0;
        if (parent) {
          parent.arrayLength ??= 0;
          index = parent.arrayLength;
          parent.arrayLength += 1;
        }
        this.structPathStack.push({ indent, key: index });
        return annotations;
      }

      const keyNode = firstDescendant(nodeRef.node, STRUCT_KEY_TOKENS);
      const key = keyNode
        ? this.read(keyNode.from, keyNode.to).trim()
        : this.read(nodeRef.from, nodeRef.to)
            .trim()
            .replace(/:\s*$/, "")
            .trim();
      const from = keyNode ? keyNode.from : nodeRef.from;
      const to = keyNode ? keyNode.to : nodeRef.to;

      const pathKeys = this.structPathStack
        .filter((p) => p.key != null)
        .map((p) => p.key);
      const propertyPath = [...pathKeys, key].join(".");
      const classWords = key.split(" ").filter(Boolean);
      const symbolIds = [
        `${this.defineType}.${this.defineName}.${propertyPath}`,
        ...(this.defineType === "screen"
          ? classWords.map((w) => `layer.${w}`)
          : []),
      ];
      const interdependentIds =
        this.defineType === "style"
          ? classWords.map((w) => `layer.${w}`)
          : this.defineType === "screen"
            ? classWords.map((w) => `style.${w}`)
            : [];
      annotations.push(
        SparkdownAnnotation.mark<Reference>({
          declaration: "property",
          symbolIds,
          interdependentIds,
          kind: "write",
        }).range(from, to),
      );
      // Push this line as a potential parent for deeper lines.
      this.structPathStack.push({ indent, key });
      return annotations;
    }

    if (nodeRef.name === "TypeName") {
      const type = this.read(nodeRef.from, nodeRef.to);
      const types = [type];
      annotations.push(
        SparkdownAnnotation.mark<Reference>({
          symbolIds: types,
          kind: "read",
        }).range(nodeRef.from, nodeRef.to),
      );
    }
    if (nodeRef.name === "LuauVariableName") {
      const name = this.read(nodeRef.from, nodeRef.to);
      // Skip the LHS name of an OOP define property — the LuauPropertyDefinition
      // branch already claimed it as a `property` declaration.
      if (
        ancestorMatching(nodeRef.node, VARIABLE_DECL_SITE, 6) &&
        ancestorMatching(nodeRef.node, PROPERTY_DEFINITION)
      ) {
        return annotations;
      }
      // Declaration site: the LHS of a `store`/`local`/`const` definition
      // (nested in LuauVariableAssignment_begin AND a LuauVariableDefinition;
      // a bare reassignment has the former but not the latter). const vs var
      // comes from the definition's LuauScopeModifier.
      if (
        ancestorMatching(nodeRef.node, VARIABLE_DECL_SITE, 6) &&
        ancestorMatching(nodeRef.node, VARIABLE_DEFINITION)
      ) {
        const definition = ancestorMatching(nodeRef.node, VARIABLE_DEFINITION);
        const scopeNode = getDescendent("LuauScopeModifier", definition);
        const scope = scopeNode
          ? this.read(scopeNode.from, scopeNode.to).trim()
          : "";
        annotations.push(
          SparkdownAnnotation.mark<Reference>({
            declaration: scope === "const" ? "const" : "var",
            symbolIds: [name],
            kind: "write",
          }).range(nodeRef.from, nodeRef.to),
        );
        return annotations;
      }
      // Value read: reference the binding by bare name (and `.name` scoped form
      // for divert-style resolution).
      annotations.push(
        SparkdownAnnotation.mark<Reference>({
          symbolIds: ["." + name, name],
          kind: "read",
          linkable: true,
          firstMatchOnly: true,
        }).range(nodeRef.from, nodeRef.to),
      );
      return annotations;
    }
    if (nodeRef.name === "AssetCommandTarget") {
      const context = getContextNames(nodeRef.node);
      // Record image target reference
      if (context.includes("ImageCommand")) {
        const types: string[] = ["layer"];
        const name = this.read(nodeRef.from, nodeRef.to);
        const displayType = `layer`;
        annotations.push(
          SparkdownAnnotation.mark<Reference>({
            selectors: [
              {
                types,
                name,
                displayType,
              },
            ],
            symbolIds: types.map((type) => `${type}.${name}`),
            kind: "read",
            linkable: true,
            interdependentIds: [`style.${name}`],
          }).range(nodeRef.from, nodeRef.to),
        );
        return annotations;
      }
      // Record audio target reference
      if (context.includes("AudioCommand")) {
        const types = ["channel"];
        const name = this.read(nodeRef.from, nodeRef.to);
        annotations.push(
          SparkdownAnnotation.mark<Reference>({
            selectors: [{ types, name }],
            symbolIds: types.map((type) => `${type}.${name}`),
            kind: "read",
            linkable: true,
          }).range(nodeRef.from, nodeRef.to),
        );
        return annotations;
      }
    }
    if (nodeRef.name === "AssetCommandFilterName") {
      const context = getContextNames(nodeRef.node);
      // Record image filter reference
      if (context.includes("ImageCommand")) {
        const types = ["filter"];
        const name = this.read(nodeRef.from, nodeRef.to);
        annotations.push(
          SparkdownAnnotation.mark<Reference>({
            selectors: [{ types, name }],
            symbolIds: types.map((type) => `${type}.${name}`),
            kind: "read",
            linkable: true,
          }).range(nodeRef.from, nodeRef.to),
        );
        return annotations;
      }
    }
    if (nodeRef.name === "AssetCommandFilteredFileName") {
      const context = getContextNames(nodeRef.node);
      // Record image name (and filter) reference
      if (context.includes("ImageCommand")) {
        const types = ["filtered_image", "layered_image", "image", "graphic"];
        const name = sortFilteredName(this.read(nodeRef.from, nodeRef.to));
        const displayType = "image";
        annotations.push(
          SparkdownAnnotation.mark<Reference>({
            selectors: [{ types, name, displayType }],
            symbolIds: types.map((type) => `${type}.${name}`),
            kind: "read",
            linkable: true,
          }).range(nodeRef.from, nodeRef.to),
        );
        return annotations;
      }
    }
    if (nodeRef.name === "AssetCommandFileName") {
      const context = getContextNames(nodeRef.node);
      // Record image file name reference
      if (context.includes("ImageCommand")) {
        const types = ["filtered_image", "layered_image", "image", "graphic"];
        const name = this.read(nodeRef.from, nodeRef.to);
        const displayType = "image";
        annotations.push(
          SparkdownAnnotation.mark<Reference>({
            selectors: [{ types, name, displayType }],
            symbolIds: types.map((type) => `${type}.${name}`),
            kind: "read",
            linkable: true,
          }).range(nodeRef.from, nodeRef.to),
        );
        return annotations;
      }
      // Record audio file name reference
      if (context.includes("AudioCommand")) {
        const types = ["layered_audio", "audio", "synth"];
        const name = this.read(nodeRef.from, nodeRef.to);
        const displayType = "audio";
        annotations.push(
          SparkdownAnnotation.mark<Reference>({
            selectors: [{ types, name, displayType }],
            symbolIds: types.map((type) => `${type}.${name}`),
            kind: "read",
            linkable: true,
          }).range(nodeRef.from, nodeRef.to),
        );
        return annotations;
      }
    }
    if (nodeRef.name === "NameValue") {
      const context = getContextNames(nodeRef.node);
      if (context.includes("ImageCommand")) {
        const clauseKeywordNode = nodeRef.node.prevSibling?.prevSibling;
        const clauseKeyword = clauseKeywordNode
          ? this.read(clauseKeywordNode.from, clauseKeywordNode.to)
          : undefined;
        const name = this.read(nodeRef.from, nodeRef.to);
        if (clauseKeyword === "with") {
          const types = ["transition", "animation"];
          const displayType = `transition or animation`;
          annotations.push(
            SparkdownAnnotation.mark<Reference>({
              selectors: [{ types, name, displayType }],
              symbolIds: types.map((type) => `${type}.${name}`),
              kind: "read",
              linkable: true,
            }).range(nodeRef.from, nodeRef.to),
          );
          return annotations;
        }
        if (clauseKeyword === "ease") {
          const types = ["ease"];
          const displayType = `ease`;
          annotations.push(
            SparkdownAnnotation.mark<Reference>({
              selectors: [{ types, name, displayType }],
              symbolIds: types.map((type) => `${type}.${name}`),
              kind: "read",
              linkable: true,
            }).range(nodeRef.from, nodeRef.to),
          );
          return annotations;
        }
      }
      if (context.includes("AudioCommand")) {
        const types = ["modulation"];
        const name = this.read(nodeRef.from, nodeRef.to);
        annotations.push(
          SparkdownAnnotation.mark<Reference>({
            selectors: [{ types, name }],
            symbolIds: types.map((type) => `${type}.${name}`),
            kind: "read",
            linkable: true,
          }).range(nodeRef.from, nodeRef.to),
        );
        return annotations;
      }
    }
    if (nodeRef.name === "DialogueCharacterName") {
      const name = this.read(nodeRef.from, nodeRef.to);
      annotations.push(
        SparkdownAnnotation.mark<Reference>({
          symbolIds: ["character." + name, "character.?.name=" + name],
          selectors: [
            { types: ["character"], name },
            { types: ["character"], property: "name", value: name },
          ],
          kind: "read",
          linkable: true,
          firstMatchOnly: true,
        }).range(nodeRef.from, nodeRef.to),
      );
      return annotations;
    }
    return annotations;
  }

  override leave(
    annotations: Range<SparkdownAnnotation<Reference>>[],
    nodeRef: SparkdownSyntaxNodeRef,
  ): Range<SparkdownAnnotation<Reference>>[] {
    if (
      nodeRef.name === "LuauDefine" ||
      STRUCTURAL_TYPE_BY_NODE[nodeRef.name]
    ) {
      this.resetDefineState();
      return annotations;
    }
    if (nodeRef.name === "DivertPath") {
      this.divertPathParts = [];
      return annotations;
    }
    return annotations;
  }
}
