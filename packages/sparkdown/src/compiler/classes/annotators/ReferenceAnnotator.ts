import { isExplicitRuleName } from "../../utils/explicitRuleNames";
import { type SyntaxNode } from "@lezer/common";
import { type SparkdownNodeName } from "../../types/SparkdownNodeName";
import { ancestorMatching } from "../../utils/ancestorMatching";
import {
  BRACE_BODY_NAMES,
  STRUCT_KEY_TOKEN_NAMES,
  braceBodyKey,
  KEYWORD_BRACE_BODY_NAMES,
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
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { LayoutVerb } from "../../../../language/sparkdown.layout-verbs";
import type { SparkDeclaration } from "../../types/SparkDeclaration";
import type { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import type { SparkSelector } from "../../types/SparkSelector";
import { sortFilteredName } from "../../utils/sortFilteredName";
import { SparkdownAnnotation } from "../SparkdownAnnotation";
import { SparkdownAnnotator } from "../SparkdownAnnotator";
import { isLuauName } from "../../utils/luauName";
import {
  DIRECTIVE_NODE_BRACKETS,
  directiveValueKind,
  readSourceDirective,
  type DirectiveWord,
  type SourceDirective,
} from "../../utils/readDirective";

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
  root?: number;
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

const PROPERTY_NAME = nodeNameSet(["LuauPropertyName"]);
const VARIABLE = nodeNameSet(["LuauVariable"]);
const STRING_INDEX = nodeNameSet(["LuauDoubleQuotedString", "LuauSingleQuotedString"]);

function isTrivia(node: SyntaxNode): boolean {
  return node.name.endsWith("Whitespace") || node.name.endsWith("Comment");
}

function significantBefore(node: SyntaxNode): SyntaxNode | null {
  let sibling = node.prevSibling;
  while (sibling && isTrivia(sibling)) sibling = sibling.prevSibling;
  return sibling;
}

function significantAfter(node: SyntaxNode): SyntaxNode | null {
  let sibling = node.nextSibling;
  while (sibling && isTrivia(sibling)) sibling = sibling.nextSibling;
  return sibling;
}

function lineContinuationAfter(node: SyntaxNode): SyntaxNode | null {
  for (let current: SyntaxNode | null = node; current?.parent; current = current.parent) {
    let next = current.nextSibling;
    while (next && (isTrivia(next) || next.name === "Newline" || next.name.endsWith("_end"))) {
      next = next.nextSibling;
    }
    if (next) return isExplicitRuleName(next.name, "LuauLineContinuation") ? next : null;
  }
  return null;
}

const FUNCTION_DECL_NAME = nodeNameSet(["LuauFunctionDeclarationName"]);
const PARAMETER_OWNER = nodeNameSet([
  "LuauFunctionDefinition",
  "LuauFunctionTypeDeclaration",
]);
const VARIABLE_DECL_SITE = nodeNameSet(["LuauVariableAssignment_begin"]);
const FILTERED_NAME = /^([^:~]+)((?:[:~][^:~\s]+)+)$/u;

const PROPERTY_DEFINITION = nodeNameSet(["LuauPropertyDefinition"]);

const EVENT_ATTR_CONTENT = nodeNameSet([
  "LuauEventAttribute_content",
  "LuauSparkleEventHandler",
  "LuauSparkleEventParenAttribute_content",
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

  protected directiveReferences(directive: SourceDirective): Range<SparkdownAnnotation<Reference>>[] {
    const references: Range<SparkdownAnnotation<Reference>>[] = [];
    const shown = (word: DirectiveWord, types: string[], displayType?: string, name = word.text, extra: Partial<Reference> = {}) =>
      references.push(
        SparkdownAnnotation.mark<Reference>({
          selectors: [{ types, name, ...(displayType ? { displayType } : {}) }],
          symbolIds: types.map((type) => `${type}.${name}`),
          kind: "read",
          linkable: true,
          ...extra,
        }).range(word.from, word.to),
      );
    const valueOf = (keyword: string) =>
      directive.clauses.filter((clause) => clause.word.text === keyword && clause.value && directiveValueKind(clause.value.text) === "name").map((clause) => clause.value!);
    const { kind, target, names } = directive;
    if (directive.bracket === "audio") {
      if (target) shown(target, ["channel"]);
      for (const name of names) {
        if (directiveValueKind(name.text) === "name" && name.text !== "none") shown(name, ["layered_audio", "audio", "synth"], "audio");
      }
      for (const value of valueOf("with")) shown(value, ["modulation"]);
      return references;
    }
    const control = directive.control?.text;
    if (kind === "layout" && control === LayoutVerb.navigate) {
      if (target) shown(target, ["screen"], "screen");
      if (directive.destination && directiveValueKind(directive.destination.text) === "name") shown(directive.destination, ["layout"], "layout");
    } else if (kind === "layout") {
      if (target) shown(target, ["layout"], "layout");
    } else if (kind === "load") {
      if (target) references.push(this.loadTargetReference(target.text, target));
    } else if (kind === "cutscene") {
      if (target && !target.text.includes("+")) shown(target, ["video"], "video");
    } else if (target) {
      shown(target, ["layer"], "layer", target.text, { interdependentIds: [`style.${target.text}`] });
    }
    if (kind !== "cutscene") {
      for (const name of names) {
        const filtered = name.text.match(FILTERED_NAME);
        const base = filtered ? filtered[1]! : name.text;
        if (directiveValueKind(base) !== "name" || base === "none") continue;
        const baseWord = { text: base, from: name.from, to: name.from + base.length };
        if (kind === "load") {
          references.push(this.loadTargetReference(base, baseWord));
          continue;
        }
        if (filtered) shown(name, ["filtered_image", "layered_image", "image", "graphic"], "image", sortFilteredName(name.text));
        shown(baseWord, ["filtered_image", "layered_image", "image", "graphic", "video"], "image");
      }
    }
    for (const value of valueOf("with")) shown(value, ["transition", "animation"], "transition or animation");
    for (const value of valueOf("ease")) shown(value, ["ease"], "ease");
    return references;
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
      if (
        n.name === "LuauStructBlockLine" ||
        n.name === "LuauSparkleBlockLine" ||
        KEYWORD_BRACE_BODY_NAMES.has(n.name)
      ) {
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

  private pushSegments(
    annotations: Range<SparkdownAnnotation<Reference>>[],
    root: SyntaxNode,
    path: string[],
    first: SyntaxNode | null,
  ): boolean {
    for (let part = first; part; part = part.nextSibling) {
      if (isTrivia(part)) continue;
      const accessor = isExplicitRuleName(part.name, "LuauAccessPart") ? part.firstChild : part;
      const segment = accessor && this.segmentName(accessor);
      if (!segment) return false;
      path.push(this.read(segment.from, segment.to));
      annotations.push(
        SparkdownAnnotation.mark<Reference>({
          symbolIds: [path.join(".")],
          kind: "read",
          root: segment.from - root.from,
        }).range(segment.from, segment.to),
      );
    }
    return true;
  }

  private segmentName(accessor: SyntaxNode): SyntaxNode | null {
    if (accessor.name === "LuauPropertyAccessor") {
      return firstDescendant(accessor, PROPERTY_NAME);
    }
    if (accessor.name === "LuauPropertyIndexer") {
      const content = findChildByName(accessor, "LuauPropertyIndexer_content");
      const index: SyntaxNode[] = [];
      for (let child = content?.firstChild; child; child = child.nextSibling) {
        if (!isTrivia(child)) index.push(child);
      }
      const string = index.length === 1 && STRING_INDEX.has(index[0]!.name) ? index[0]! : null;
      const name = string && findChildByName(string, `${string.name}_content`);
      if (name && isLuauName(this.read(name.from, name.to))) {
        return name;
      }
    }
    return null;
  }

  private pushAccessPathSegments(
    annotations: Range<SparkdownAnnotation<Reference>>[],
    root: SyntaxNode,
    name: string,
  ) {
    const part = ancestorMatching(root, VARIABLE, 2)?.parent;
    const path = part?.parent?.parent;
    if (
      !part ||
      !path ||
      !isExplicitRuleName(part.name, "LuauAccessPart") ||
      !isExplicitRuleName(path.name, "LuauAccessPath") ||
      !onlyTrivia(part.prevSibling, "prevSibling")
    ) {
      return;
    }
    if (definePropertyReference(path)?.property && DEFINE_ASSET_TYPES.includes(name)) return;
    const segments = [name];
    if (!this.pushSegments(annotations, root, segments, part.nextSibling)) return;
    let first: SyntaxNode = path;
    let last: SyntaxNode = path;
    for (;;) {
      const next = significantAfter(last);
      if (next && isExplicitRuleName(next.name, "LuauChainedPropertyAccess")) {
        const content = findChildByName(next, `${next.name}_content`);
        if (!this.pushSegments(annotations, root, segments, content?.firstChild ?? null)) return;
        last = next;
        continue;
      }
      if (next && next.name !== "Newline") return;
      if (!next && first.parent?.name === "LuauParenthetical_content" && !significantBefore(first)) {
        first = last = first.parent.parent!;
        continue;
      }
      const continuation = lineContinuationAfter(last);
      const content = continuation && findChildByName(continuation, `${continuation.name}_content`);
      if (!content || !this.pushSegments(annotations, root, segments, content.firstChild)) return;
      first = last = continuation;
    }
  }

  private pushStylingAccessPath(
    annotations: Range<SparkdownAnnotation<Reference>>[],
    path: SyntaxNode,
  ) {
    const content = findChildByName(path, "StylingAccessPath_content");
    const parts: SyntaxNode[] = [];
    for (let part = content?.firstChild; part; part = part.nextSibling) {
      if (!isTrivia(part)) parts.push(part);
    }
    const namespace = parts[0]?.firstChild;
    const typeName = namespace?.name === "NamespaceAccessor" ? getDescendent("TypeName", namespace) : null;
    if (!namespace || !typeName) return;
    const type = this.read(typeName.from, typeName.to);
    annotations.push(
      SparkdownAnnotation.mark<Reference>({
        symbolIds: ["." + type, type],
        kind: "read",
        linkable: true,
        firstMatchOnly: true,
      }).range(typeName.from, typeName.to),
    );
    const name = getDescendent("VariableName", namespace);
    if (!name) return;
    const assetName = this.read(name.from, name.to);
    if (
      parts.length === 1 &&
      DEFINE_ASSET_TYPES.includes(type) &&
      onlyTrivia(path.prevSibling, "prevSibling") &&
      onlyTrivia(path.nextSibling, "nextSibling")
    ) {
      annotations.push(
        SparkdownAnnotation.mark<Reference>({
          symbolIds: [`${type}.${assetName}`],
          kind: "read",
          asset: { types: [type], name: assetName, typed: true },
        }).range(name.from, name.to),
      );
      return;
    }
    const segments = [type];
    const properties = parts.slice(1).map((part) =>
      part.firstChild?.name === "PropertyAccessor" ? getDescendent("PropertyName", part.firstChild) : null,
    );
    for (const segmentName of [name, ...properties]) {
      if (!segmentName) return;
      segments.push(this.read(segmentName.from, segmentName.to));
      annotations.push(
        SparkdownAnnotation.mark<Reference>({
          symbolIds: [segments.join(".")],
          kind: "read",
          root: segmentName.from - typeName.from,
        }).range(segmentName.from, segmentName.to),
      );
    }
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
      nodeRef.name === "LuauSparkleEventAttribute" ||
      nodeRef.name === "LuauSparkleEventParenAttribute"
    ) {
      const content = firstDescendant(nodeRef.node, EVENT_ATTR_CONTENT);
      const hasClosure = !!firstDescendant(nodeRef.node, EVENT_HANDLER_CLOSURE);
      if (content && !hasClosure) {
        const raw = this.read(content.from, content.to).trim();
        const callee = raw.replace(/\s*\([\s\S]*\)\s*$/, "");
        if (isLuauName(callee)) {
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

    if (nodeRef.name === "StylingAccessPath") {
      this.pushStylingAccessPath(annotations, nodeRef.node);
      return annotations;
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
      this.pushAccessPathSegments(annotations, nodeRef.node, name);
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
              symbolIds: [`${type}.${name}`],
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
    if (Object.hasOwn(DIRECTIVE_NODE_BRACKETS, nodeRef.name)) {
      const directive = readSourceDirective(nodeRef, (from, to) => this.read(from, to));
      if (directive) annotations.push(...this.directiveReferences(directive));
      return annotations;
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
