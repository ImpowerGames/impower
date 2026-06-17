import { Range } from "@codemirror/state";
import { getContextNames } from "@impower/textmate-grammar-tree/src/tree/utils/getContextNames";
import { getContextStack } from "@impower/textmate-grammar-tree/src/tree/utils/getContextStack";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { getDescendentInsideParent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendentInsideParent";
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

const FUNCTION_DECL_NAME = new Set(["LuauFunctionDeclarationName"]);
const FUNCTION_DEFINITION = new Set(["LuauFunctionDefinition"]);
const VARIABLE_DECL_SITE = new Set(["LuauVariableAssignment_begin"]);
const VARIABLE_DEFINITION = new Set(["LuauVariableDefinition"]);

export class ReferenceAnnotator extends SparkdownAnnotator<
  SparkdownAnnotation<Reference>
> {
  defineModifier = "";

  defineType = "";

  defineName = "";

  definePropertyPathParts: {
    key?: string | number;
    arrayLength?: number;
  }[] = [];

  divertPathParts: string[] = [];

  override begin() {
    this.defineModifier = "";
    this.defineType = "";
    this.defineName = "";
    this.definePropertyPathParts = [];
    this.divertPathParts = [];
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
    if (nodeRef.name === "DefineIdentifier") {
      const context = getContextNames(nodeRef.node);
      if (
        context.includes("DefineViewDeclaration") ||
        context.includes("DefineStylingDeclaration") ||
        context.includes("DefinePlainDeclaration")
      ) {
        annotations.push(
          SparkdownAnnotation.mark<Reference>({
            declaration: "define",
            kind: "write",
          }).range(nodeRef.from, nodeRef.to),
        );
        return annotations;
      }
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
    if (
      nodeRef.name === "DefineViewDeclaration" ||
      nodeRef.name === "DefineStylingDeclaration" ||
      nodeRef.name === "DefinePlainDeclaration"
    ) {
      this.defineModifier = "";
      this.defineType = "";
      this.defineName = "";
      this.definePropertyPathParts = [{}];
      return annotations;
    }
    if (nodeRef.name === "DefineModifierName") {
      this.defineModifier = this.read(nodeRef.from, nodeRef.to);
      return annotations;
    }
    if (nodeRef.name === "DefineTypeName") {
      this.defineType = this.read(nodeRef.from, nodeRef.to);
      annotations.push(
        SparkdownAnnotation.mark<Reference>({
          symbolIds: [this.defineType],
          declaration: "define_type_name",
          kind: "write",
          selectors: [
            {
              types: [this.defineType],
              name: "$default",
              displayType: "type",
              displayName: this.defineType,
            },
          ],
        }).range(nodeRef.from, nodeRef.to),
      );
      return annotations;
    }
    if (nodeRef.name === "DefineVariableName") {
      this.defineName = this.read(nodeRef.from, nodeRef.to);
      annotations.push(
        SparkdownAnnotation.mark<Reference>({
          symbolIds: [this.defineType + "." + this.defineName],
          linkable: true,
          declaration: "define_variable_name",
          kind: "write",
        }).range(nodeRef.from, nodeRef.to),
      );
      return annotations;
    }
    if (
      nodeRef.name === "ViewStructScalarItem" ||
      nodeRef.name === "StylingStructScalarItem" ||
      nodeRef.name === "PlainStructScalarItem" ||
      nodeRef.name === "ViewStructObjectItemBlock" ||
      nodeRef.name === "StylingStructObjectItemBlock" ||
      nodeRef.name === "PlainStructObjectItemBlock" ||
      nodeRef.name === "ViewStructObjectItemWithInlineScalarProperty" ||
      nodeRef.name === "StylingStructObjectItemWithInlineScalarProperty" ||
      nodeRef.name === "PlainStructObjectItemWithInlineScalarProperty" ||
      nodeRef.name === "ViewStructObjectItemWithInlineObjectProperty" ||
      nodeRef.name === "StylingStructObjectItemWithInlineObjectProperty" ||
      nodeRef.name === "PlainStructObjectItemWithInlineObjectProperty"
    ) {
      const parent = this.definePropertyPathParts.at(-1);
      if (parent) {
        parent.arrayLength ??= 0;
        this.definePropertyPathParts.push({ key: parent.arrayLength });
        parent.arrayLength += 1;
      }
      return annotations;
    }
    if (
      nodeRef.name === "ViewDeclarationScalarPropertyName" ||
      nodeRef.name === "StylingDeclarationScalarPropertyName" ||
      nodeRef.name === "PlainDeclarationScalarPropertyName" ||
      nodeRef.name === "ViewDeclarationObjectPropertyName" ||
      nodeRef.name === "StylingDeclarationObjectPropertyName" ||
      nodeRef.name === "PlainDeclarationObjectPropertyName"
    ) {
      const name = this.read(nodeRef.from, nodeRef.to);
      this.definePropertyPathParts.push({
        key: name,
      });
      const propertyPath = this.definePropertyPathParts
        .filter((p) => p.key != null)
        .map(({ key }) => key)
        .join(".");
      annotations.push(
        SparkdownAnnotation.mark<Reference>({
          declaration: "property",
          symbolIds: [
            this.defineType + "." + this.defineName + "." + propertyPath,
            ...(this.defineType === "screen"
              ? name.split(" ").map((n) => `layer.${n}`)
              : []),
          ],
          interdependentIds:
            this.defineType === "style"
              ? name.split(" ").map((n) => `layer.${n}`)
              : this.defineType === "screen"
                ? name.split(" ").map((n) => `style.${n}`)
                : [],
          kind: "write",
        }).range(nodeRef.from, nodeRef.to),
      );
      // For verifying linked types actually exist
      if (propertyPath.startsWith(".link.")) {
        const type = propertyPath.split(".").findLast((n) => Boolean(n));
        if (type) {
          annotations.push(
            SparkdownAnnotation.mark<Reference>({
              selectors: [{ types: [type] }],
            }).range(nodeRef.from, nodeRef.to),
          );
        }
      }
      return annotations;
    }
    if (
      nodeRef.name === "ViewStructFieldValue" ||
      nodeRef.name === "StylingStructFieldValue" ||
      nodeRef.name === "PlainStructFieldValue"
    ) {
      // For type checking
      const defineProperty = this.definePropertyPathParts
        .filter((p) => p.key != null)
        .map((p) => p.key)
        .join(".");
      const declaration = {
        modifier: this.defineModifier,
        type: this.defineType,
        name: this.defineName,
        property: defineProperty,
      };
      annotations.push(
        SparkdownAnnotation.mark<Reference>({
          assigned: declaration,
          prop: true,
        }).range(nodeRef.from, nodeRef.to),
      );
      // For finding references
      const value = this.read(nodeRef.from, nodeRef.to);
      const isCharacterNameFieldValue =
        this.defineType === "character" && defineProperty === "name";
      const symbolIds = isCharacterNameFieldValue
        ? ["character.?.name=" + value.slice(1, -1)]
        : [];
      // don't include surrounding string quotes in symbol range
      const from = value.startsWith('"') ? nodeRef.from + 1 : nodeRef.from;
      const to = value.endsWith('"') ? nodeRef.to - 1 : nodeRef.to;
      annotations.push(
        SparkdownAnnotation.mark<Reference>({
          symbolIds,
          declaration: isCharacterNameFieldValue ? "character_name" : undefined,
        }).range(from, to),
      );
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
      const context = getContextStack(nodeRef.node);
      const typeNameNode = getDescendentInsideParent(
        ["TypeName"],
        ["LuauAccessPath", "StylingAccessPath"],
        context,
      );
      const types = typeNameNode
        ? [this.read(typeNameNode.from, typeNameNode.to)]
        : [];
      // Record reference in field value
      if (
        context.some(
          (n) =>
            n.name === "ViewStructFieldValue" ||
            n.name === "StylingStructFieldValue" ||
            n.name === "PlainStructFieldValue",
        )
      ) {
        const defineProperty = this.definePropertyPathParts
          .filter((p) => p.key != null)
          .map((p) => p.key)
          .join(".");
        const declaration = {
          modifier: this.defineModifier,
          type: this.defineType,
          name: this.defineName,
          property: defineProperty,
        };
        if (types.length > 0) {
          annotations.push(
            SparkdownAnnotation.mark<Reference>({
              selectors: [{ types, name }],
              assigned: declaration,
              symbolIds: types.map((type) => `${type}.${name}`),
              kind: "read",
              linkable: true,
            }).range(nodeRef.from, nodeRef.to),
          );
          return annotations;
        } else {
          const name = this.read(nodeRef.from, nodeRef.to);
          annotations.push(
            SparkdownAnnotation.mark<Reference>({
              selectors: [{ name }],
              assigned: declaration,
              symbolIds: ["?" + "." + name], // will need to infer type later
              kind: "read",
              linkable: true,
            }).range(nodeRef.from, nodeRef.to),
          );
          return annotations;
        }
      } else {
        if (types.length > 0) {
          annotations.push(
            SparkdownAnnotation.mark<Reference>({
              symbolIds: types.map((type) => `${type}.${name}`),
              kind: "read",
              linkable: true,
            }).range(nodeRef.from, nodeRef.to),
          );
          return annotations;
        } else {
          const name = this.read(nodeRef.from, nodeRef.to);
          annotations.push(
            SparkdownAnnotation.mark<Reference>({
              symbolIds:
                types.length > 0
                  ? types.map((type) => `${type}.${name}`)
                  : ["." + name, name],
              kind: "read",
              linkable: true,
              firstMatchOnly: true,
            }).range(nodeRef.from, nodeRef.to),
          );
          return annotations;
        }
      }
    }
    if (nodeRef.name === "StylingStringIdentifier") {
      const context = getContextStack(nodeRef.node);
      // Record reference in field value
      if (context.some((n) => n.name === "StylingStructFieldValue")) {
        const defineProperty = this.definePropertyPathParts
          .filter((p) => p.key != null)
          .map((p) => p.key)
          .join(".");
        const declaration = {
          modifier: this.defineModifier,
          type: this.defineType,
          name: this.defineName,
          property: defineProperty,
        };
        const name = this.read(nodeRef.from, nodeRef.to);
        annotations.push(
          SparkdownAnnotation.mark<Reference>({
            selectors: [{ name }],
            assigned: declaration,
            symbolIds: ["?" + "." + name], // will need to infer type later
            kind: "read",
            linkable: true,
            stylingStringIdentifier: true,
          }).range(nodeRef.from, nodeRef.to),
        );
        return annotations;
      }
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
      nodeRef.name === "DefineViewDeclaration" ||
      nodeRef.name === "DefineStylingDeclaration" ||
      nodeRef.name === "DefinePlainDeclaration"
    ) {
      this.defineModifier = "";
      this.defineType = "";
      this.defineName = "";
      this.definePropertyPathParts = [];
      return annotations;
    }
    if (
      nodeRef.name === "ViewStructScalarItem" ||
      nodeRef.name === "StylingStructScalarItem" ||
      nodeRef.name === "PlainStructScalarItem" ||
      nodeRef.name === "ViewStructObjectItemBlock" ||
      nodeRef.name === "PlainStructObjectItemBlock" ||
      nodeRef.name === "ViewStructObjectItemWithInlineScalarProperty" ||
      nodeRef.name === "PlainStructObjectItemWithInlineScalarProperty" ||
      nodeRef.name === "ViewStructObjectItemWithInlineObjectProperty" ||
      nodeRef.name === "PlainStructObjectItemWithInlineObjectProperty" ||
      nodeRef.name === "ViewStructObjectItemWithInlineScalarProperty_begin" ||
      nodeRef.name === "PlainStructObjectItemWithInlineScalarProperty_begin" ||
      nodeRef.name === "ViewStructObjectItemWithInlineObjectProperty_end" ||
      nodeRef.name === "PlainStructObjectItemWithInlineObjectProperty_end"
    ) {
      this.definePropertyPathParts.pop();
      return annotations;
    }
    if (
      nodeRef.name === "ViewStructScalarProperty" ||
      nodeRef.name === "StylingStructScalarProperty" ||
      nodeRef.name === "PlainStructScalarProperty" ||
      nodeRef.name === "ViewStructObjectProperty" ||
      nodeRef.name === "PlainStructObjectProperty"
    ) {
      this.definePropertyPathParts.pop();
      return annotations;
    }
    if (nodeRef.name === "DivertPath") {
      this.divertPathParts = [];
      return annotations;
    }
    return annotations;
  }
}
