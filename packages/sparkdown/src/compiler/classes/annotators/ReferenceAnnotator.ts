import { isExplicitRuleName } from "../../utils/explicitRuleNames";
import { type SyntaxNode } from "@lezer/common";
import { type SparkdownNodeName } from "../../types/SparkdownNodeName";
import { ancestorMatching } from "../../utils/ancestorMatching";
import {
  BRACE_BODY_NAMES,
  STRUCT_KEY_TOKEN_NAMES,
  braceBodyKey,
  sparkleElementKeyParts,
  sparklePartWords,
  structBlockKeyNode,
  structKeyToken,
} from "../../utils/braceBlocks";
import { findChildByName } from "../../utils/findChildByName";
import { nodeNameSet } from "../../utils/nodeNameSet";
import {
  VARIABLE_DEFINITION_NAMES,
  isValueListName,
} from "../../utils/variableDefinitionNames";
import { Range } from "@codemirror/state";
import { getContextNames } from "@impower/textmate-grammar-tree/src/tree/utils/getContextNames";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import GRAMMAR_DEFINITION from "../../../../language/sparkdown.language-grammar.json";
import type { SparkDeclaration } from "../../types/SparkDeclaration";
import type { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import type { SparkSelector } from "../../types/SparkSelector";
import { sortFilteredName } from "../../utils/sortFilteredName";
import { SparkdownAnnotation } from "../SparkdownAnnotation";
import { SparkdownAnnotator } from "../SparkdownAnnotator";

export interface Reference {
  usage?: "divert" | "handler";
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
  asset?: { types: string[]; name: string; typed?: boolean };
}

export const DEFINE_ASSET_TYPES = ["image", "layered_image", "filtered_image"];

function onlyTrivia(node: SyntaxNode | null, direction: "prevSibling" | "nextSibling"): boolean {
  for (let sibling = node; sibling; sibling = sibling[direction]) {
    if (!sibling.name.endsWith("Whitespace") && !sibling.name.endsWith("Comment")) return false;
  }
  return true;
}

function definePropertyReference(
  path: SyntaxNode | null | undefined,
): { variable: SyntaxNode; property: SyntaxNode | null } | null {
  if (path?.name !== "LuauAccessPath") return null;
  let value: SyntaxNode = path;
  while (value.parent?.name === "LuauParenthetical_content") {
    if (!onlyTrivia(value.prevSibling, "prevSibling") || !onlyTrivia(value.nextSibling, "nextSibling")) {
      return null;
    }
    value = value.parent.parent!;
  }
  if (value.parent?.name !== "LuauAssignmentOperation_content") return null;
  if (value.parent.parent?.parent?.parent?.parent?.parent?.name !== "LuauPropertyDefinition") {
    return null;
  }
  if (!onlyTrivia(value.nextSibling, "nextSibling")) return null;
  const content = findChildByName(path, "LuauAccessPath_content");
  const parts: SyntaxNode[] = [];
  for (let part = content?.firstChild; part; part = part.nextSibling) {
    if (part.name !== "LuauAccessPart") return null;
    parts.push(part);
  }
  if (parts.length < 1 || parts.length > 2) return null;
  const variable = parts[0]!.firstChild;
  const variableName =
    variable?.name === "LuauVariable" ? getDescendent("LuauVariableName", variable) : null;
  if (!variableName) return null;
  if (parts.length === 1) return { variable: variableName, property: null };
  const accessor = parts[1]!.firstChild;
  const propertyName =
    accessor?.name === "LuauPropertyAccessor" ? getDescendent("LuauPropertyName", accessor) : null;
  return propertyName ? { variable: variableName, property: propertyName } : null;
}

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

const FUNCTION_DECL_NAME = nodeNameSet(["LuauFunctionDeclarationName"]);
const PARAMETER_OWNER = nodeNameSet([
  "LuauFunctionDefinition",
  "LuauFunctionTypeDeclaration",
]);
const VARIABLE_DECL_SITE = nodeNameSet(["LuauVariableAssignment_begin"]);
const ASSET_COMMAND_INSTRUCTION = nodeNameSet(["AssetCommandInstruction"]);
const ASSET_COMMAND_CONTROL = nodeNameSet(["AssetCommandControl"]);
const ASSET_COMMAND = nodeNameSet(["ImageCommand", "AudioCommand"]);

const PROPERTY_DEFINITION = nodeNameSet(["LuauPropertyDefinition"]);

const EVENT_ATTR_CONTENT = nodeNameSet([
  "LuauEventAttribute_content",
  "LuauSparkleEventHandler",
]);
const EVENT_HANDLER_CLOSURE = nodeNameSet(["LuauSparkleHandlerClosure"]);
const EVENT_HANDLER_NAME = nodeNameSet([
  "LuauSparkleEventHandlerName",
  "LuauFunctionName",
  "LuauVariableName",
]);

const LIST_ENTRY_NAMES = nodeNameSet([
  "LuauStructListBlock",
  "LuauStructListValue",
]);

const STRUCT_KEY_TOKENS = STRUCT_KEY_TOKEN_NAMES;

const STRUCTURAL_TYPE_BY_NODE: Partial<Record<SparkdownNodeName, string>> = {
  LuauStyle: "style",
  LuauLayout: "layout",
  LuauScreen: "screen",
  LuauComponent: "component",
  LuauAnimation: "animation",
  LuauTheme: "theme",
  LuauMorph: "morph",
};

const LAYOUT_CONTROL_KEYWORDS: string[] =
  GRAMMAR_DEFINITION.variables.LAYOUT_CONTROL_KEYWORDS || [];

const LOAD_CONTROL_KEYWORDS: string[] =
  GRAMMAR_DEFINITION.variables.LOAD_CONTROL_KEYWORDS || [];

const MOVIE_CONTROL_KEYWORDS: string[] =
  GRAMMAR_DEFINITION.variables.MOVIE_CONTROL_KEYWORDS || [];

export class ReferenceAnnotator extends SparkdownAnnotator<
  SparkdownAnnotation<Reference>
> {
  protected loadTargetReference(
    name: string,
    nodeRef: { from: number; to: number },
  ) {
    return SparkdownAnnotation.mark<Reference>({
      usage: "divert",
      symbolIds: ["." + name, name, `world.${name}`],
      firstMatchOnly: true,
      kind: "read",
    }).range(nodeRef.from, nodeRef.to);
  }

  defineType = "";

  defineName = "";

  inStructural = false;

  oopHasParent = false;

  pendingOOPName: { from: number; to: number; name: string } | null = null;

  divertPathParts: string[] = [];

  override begin() {
    this.defineType = "";
    this.defineName = "";
    this.inStructural = false;
    this.oopHasParent = false;
    this.pendingOOPName = null;
    this.divertPathParts = [];
  }

  private resetDefineState() {
    this.defineType = "";
    this.defineName = "";
    this.inStructural = false;
    this.oopHasParent = false;
    this.pendingOOPName = null;
  }

  private braceBlockPath(node: SyntaxNode): string[] {
    const keys: string[] = [];
    for (let n = node.parent; n; n = n.parent) {
      if (n.name === "LuauStructBlockLine" || n.name === "LuauSparkleBlockLine") {
        break;
      }
      if (!BRACE_BODY_NAMES.has(n.name)) continue;
      if (n.name === "LuauStructListBlock") {
        let index = 0;
        for (let prev = n.prevSibling; prev; prev = prev.prevSibling) {
          if (LIST_ENTRY_NAMES.has(prev.name)) index += 1;
        }
        keys.unshift(String(index));
        continue;
      }
      const key = braceBodyKey(n, (from, to) => this.read(from, to));
      if (key != null) keys.unshift(key);
    }
    return keys;
  }

  private pushClassWordReferences(
    annotations: Range<SparkdownAnnotation<Reference>>[],
    words: SyntaxNode[],
  ) {
    if (this.defineType !== "layout" && this.defineType !== "component") {
      return;
    }
    for (const word of words) {
      const wordText = this.read(word.from, word.to).trim();
      annotations.push(
        SparkdownAnnotation.mark<Reference>({
          symbolIds: [`layer.${wordText}`, `style.${wordText}`],
          kind: "read",
        }).range(word.from, word.to),
      );
    }
  }

  private structKeyReference(
    path: (string | number)[],
    key: string,
    from: number,
    to: number,
  ) {
    const classWords = key.split(" ").filter(Boolean);
    return SparkdownAnnotation.mark<Reference>({
      declaration: "property",
      symbolIds: [
        `${this.defineType}.${this.defineName}.${path.join(".")}`,
        ...(this.defineType === "layout"
          ? classWords.map((w) => `layer.${w}`)
          : []),
      ],
      interdependentIds:
        this.defineType === "style"
          ? classWords.map((w) => `layer.${w}`)
          : this.defineType === "layout"
            ? classWords.map((w) => `style.${w}`)
            : [],
      kind: "write",
    }).range(from, to);
  }

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
    if (
      nodeRef.name === "LuauEventAttribute" ||
      nodeRef.name === "LuauSparkleEventAttribute"
    ) {
      const content = firstDescendant(nodeRef.node, EVENT_ATTR_CONTENT);
      const hasClosure = !!firstDescendant(nodeRef.node, EVENT_HANDLER_CLOSURE);
      if (content && !hasClosure) {
        const raw = this.read(content.from, content.to).trim();
        const callee = raw.replace(/\s*\([\s\S]*\)\s*$/, "");
        if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(callee)) {
          const nameNode = firstDescendant(content, EVENT_HANDLER_NAME) ?? content;
          annotations.push(
            SparkdownAnnotation.mark<Reference>({
              usage: "handler",
              symbolIds: [callee],
              kind: "read",
            }).range(nameNode.from, nameNode.to),
          );
        }
      }
      return annotations;
    }
    if (nodeRef.name === "LuauFunctionName") {
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
      const definition = ancestorMatching(nodeRef.node, PARAMETER_OWNER);
      let functionNameNode = null;
      if (definition?.name === "LuauFunctionTypeDeclaration") {
        functionNameNode = getDescendent("LuauTypeFunctionName", definition);
      } else if (definition?.name === "LuauFunctionDefinition") {
        const declName = getDescendent("LuauFunctionDeclarationName", definition);
        functionNameNode = declName
          ? getDescendent("LuauFunctionName", declName)
          : null;
      }
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
        this.defineName = name;
        annotations.push(
          SparkdownAnnotation.mark<Reference>({
            declaration: "define_variable_name",
            symbolIds: [`${this.defineType}.${name}`],
            ...(this.defineType === "style"
              ? { interdependentIds: [`layer.${name}`] }
              : {}),
            kind: "write",
            linkable: true,
          }).range(nodeRef.from, nodeRef.to),
        );
        return annotations;
      }
      if (!this.oopHasParent) {
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
      this.defineName = name;
      this.pendingOOPName = { from: nodeRef.from, to: nodeRef.to, name };
      return annotations;
    }
    if (nodeRef.name === "LuauDefineParentName") {
      const parent = this.read(nodeRef.from, nodeRef.to).trim();
      if (this.inStructural) {
        annotations.push(
          SparkdownAnnotation.mark<Reference>({
            symbolIds: [`${this.defineType}.${parent}`],
            kind: "read",
            linkable: true,
          }).range(nodeRef.from, nodeRef.to),
        );
        return annotations;
      }
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

    if (nodeRef.name === "LuauPropertyDefinition") {
      const ownBegin = findChildByName(nodeRef.node, "LuauPropertyDefinition_begin");
      const keywordKey = ownBegin ? getDescendent("LuauDefineKeywordKey", ownBegin) : null;
      const begin = keywordKey ? null : getDescendent(["LuauVariableAssignment_begin", "LuauSparkdownExplicitVariableAssignment_begin"], nodeRef.node);
      const nameNode = keywordKey ?? (begin
        ? getDescendent("LuauVariableName", begin)
        : getDescendent("LuauVariableName", nodeRef.node));
      if (nameNode) {
        const propName = this.read(nameNode.from, nameNode.to).trim();
        annotations.push(
          SparkdownAnnotation.mark<Reference>({
            declaration: "property",
            symbolIds: [`${this.defineType}.${this.defineName}.${propName}`],
            kind: "write",
          }).range(nameNode.from, nameNode.to),
        );
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

    if (
      this.inStructural &&
      (nodeRef.name === "LuauStructBlock" ||
        nodeRef.name === "LuauStructBlockProperty")
    ) {
      const keyNode =
        nodeRef.name === "LuauStructBlock"
          ? structBlockKeyNode(nodeRef.node)
          : firstDescendant(nodeRef.node, STRUCT_KEY_TOKENS);
      if (!keyNode) return annotations;
      const token =
        nodeRef.name === "LuauStructBlock" ? structKeyToken(keyNode) : keyNode;
      const key = this.read(token.from, token.to).trim();
      annotations.push(
        this.structKeyReference(
          [...this.braceBlockPath(nodeRef.node), key],
          key,
          token.from,
          token.to,
        ),
      );
      return annotations;
    }
    if (this.inStructural && nodeRef.name === "LuauSparkleElement") {
      const { name, words, call } = sparkleElementKeyParts(nodeRef.node);
      if (name && !call) {
        const nameText = this.read(name.from, name.to).trim();
        const key = [name, ...words]
          .map((n) => this.read(n.from, n.to).trim())
          .join(" ");
        const path = [...this.braceBlockPath(nodeRef.node), key].join(".");
        annotations.push(
          SparkdownAnnotation.mark<Reference>({
            declaration: "property",
            symbolIds: [
              `${this.defineType}.${this.defineName}.${path}`,
              `layer.${nameText}`,
            ],
            interdependentIds: [`style.${nameText}`],
            kind: "write",
          }).range(name.from, name.to),
        );
      }
      this.pushClassWordReferences(annotations, words);
      return annotations;
    }
    if (this.inStructural && nodeRef.name === "LuauSparkleElementContinuation") {
      const content = findChildByName(
        nodeRef.node,
        "LuauSparkleElementContinuation_content",
      );
      if (content) {
        this.pushClassWordReferences(annotations, sparklePartWords(content));
      }
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
      if (
        ancestorMatching(nodeRef.node, VARIABLE_DECL_SITE, 6) &&
        ancestorMatching(nodeRef.node, PROPERTY_DEFINITION)
      ) {
        return annotations;
      }
      if (
        ancestorMatching(nodeRef.node, VARIABLE_DECL_SITE, 6) &&
        ancestorMatching(nodeRef.node, VARIABLE_DEFINITION_NAMES) &&
        !isValueListName(nodeRef.node)
      ) {
        const definition = ancestorMatching(nodeRef.node, VARIABLE_DEFINITION_NAMES);
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
      const valueReference = definePropertyReference(
        nodeRef.node.parent?.parent?.parent?.parent?.parent,
      );
      const asset =
        valueReference && !valueReference.property
          ? { types: DEFINE_ASSET_TYPES, name }
          : undefined;
      annotations.push(
        SparkdownAnnotation.mark<Reference>({
          symbolIds: ["." + name, name],
          kind: "read",
          linkable: true,
          firstMatchOnly: true,
          ...(asset ? { asset } : {}),
        }).range(nodeRef.from, nodeRef.to),
      );
      return annotations;
    }
    if (nodeRef.name === "LuauPropertyName") {
      const valueReference = definePropertyReference(
        nodeRef.node.parent?.parent?.parent?.parent?.parent,
      );
      if (valueReference?.property) {
        const type = this.read(valueReference.variable.from, valueReference.variable.to);
        if (DEFINE_ASSET_TYPES.includes(type)) {
          const name = this.read(nodeRef.from, nodeRef.to);
          annotations.push(
            SparkdownAnnotation.mark<Reference>({
              kind: "read",
              asset: { types: [type], name, typed: true },
            }).range(nodeRef.from, nodeRef.to),
          );
          return annotations;
        }
      }
    }
    if (nodeRef.name === "LuauLayoutScreenName") {
      const name = this.read(nodeRef.from, nodeRef.to).trim();
      annotations.push(
        SparkdownAnnotation.mark<Reference>({
          selectors: [{ types: ["screen"], name, displayType: "screen" }],
          symbolIds: [`screen.${name}`],
          kind: "read",
          linkable: true,
        }).range(nodeRef.from, nodeRef.to),
      );
      return annotations;
    }
    if (nodeRef.name === "AssetCommandTarget") {
      const context = getContextNames(nodeRef.node);
      if (context.includes("ImageCommand")) {
        const name = this.read(nodeRef.from, nodeRef.to);
        const instruction = ancestorMatching(
          nodeRef.node,
          ASSET_COMMAND_INSTRUCTION,
        );
        const controlNode = instruction
          ? firstDescendant(instruction, ASSET_COMMAND_CONTROL)
          : null;
        const control = controlNode
          ? this.read(controlNode.from, controlNode.to).trim()
          : "";
        if (control === "navigate") {
          annotations.push(
            SparkdownAnnotation.mark<Reference>({
              selectors: [{ types: ["screen"], name, displayType: "screen" }],
              symbolIds: [`screen.${name}`],
              kind: "read",
              linkable: true,
            }).range(nodeRef.from, nodeRef.to),
          );
          return annotations;
        }
        if (LAYOUT_CONTROL_KEYWORDS.includes(control)) {
          annotations.push(
            SparkdownAnnotation.mark<Reference>({
              selectors: [{ types: ["layout"], name, displayType: "layout" }],
              symbolIds: [`layout.${name}`],
              kind: "read",
              linkable: true,
            }).range(nodeRef.from, nodeRef.to),
          );
          return annotations;
        }
        if (LOAD_CONTROL_KEYWORDS.includes(control)) {
          annotations.push(this.loadTargetReference(name, nodeRef));
          return annotations;
        }
        if (MOVIE_CONTROL_KEYWORDS.includes(control)) {
          if (!name.includes("+")) {
            annotations.push(
              SparkdownAnnotation.mark<Reference>({
                selectors: [{ types: ["video"], name, displayType: "video" }],
                symbolIds: [`video.${name}`],
                kind: "read",
                linkable: true,
              }).range(nodeRef.from, nodeRef.to),
            );
          }
          return annotations;
        }
        const types: string[] = ["layer"];
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
    if (nodeRef.name === "AssetCommandFilteredFileName") {
      const context = getContextNames(nodeRef.node);
      if (context.includes("ImageCommand")) {
        const instruction = ancestorMatching(
          nodeRef.node,
          ASSET_COMMAND_INSTRUCTION,
        );
        const controlNode = instruction
          ? firstDescendant(instruction, ASSET_COMMAND_CONTROL)
          : null;
        const control = controlNode
          ? this.read(controlNode.from, controlNode.to).trim()
          : "";
        if (MOVIE_CONTROL_KEYWORDS.includes(control)) {
          return annotations;
        }
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
      if (context.includes("ImageCommand")) {
        const name = this.read(nodeRef.from, nodeRef.to);
        const instruction = ancestorMatching(
          nodeRef.node,
          ASSET_COMMAND_INSTRUCTION,
        );
        const controlNode = instruction
          ? firstDescendant(instruction, ASSET_COMMAND_CONTROL)
          : null;
        const control = controlNode
          ? this.read(controlNode.from, controlNode.to).trim()
          : "";
        if (LOAD_CONTROL_KEYWORDS.includes(control)) {
          annotations.push(this.loadTargetReference(name, nodeRef));
          return annotations;
        }
        if (MOVIE_CONTROL_KEYWORDS.includes(control)) {
          return annotations;
        }
        const types = [
          "filtered_image",
          "layered_image",
          "image",
          "graphic",
          "video",
        ];
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
        if (clauseKeyword === "to") {
          const command = ancestorMatching(nodeRef.node, ASSET_COMMAND);
          const controlNode = command
            ? firstDescendant(command, ASSET_COMMAND_CONTROL)
            : null;
          const control = controlNode
            ? this.read(controlNode.from, controlNode.to).trim()
            : "";
          if (control === "navigate") {
            annotations.push(
              SparkdownAnnotation.mark<Reference>({
                selectors: [{ types: ["layout"], name, displayType: "layout" }],
                symbolIds: [`layout.${name}`],
                kind: "read",
                linkable: true,
              }).range(nodeRef.from, nodeRef.to),
            );
            return annotations;
          }
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
    if (isExplicitRuleName(nodeRef.name, "DivertPath")) {
      this.divertPathParts = [];
      return annotations;
    }
    return annotations;
  }
}
