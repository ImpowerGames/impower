import { Range } from "@codemirror/state";
import { getContextNames } from "@impower/textmate-grammar-tree/src/tree/utils/getContextNames";
import { getContextStack } from "@impower/textmate-grammar-tree/src/tree/utils/getContextStack";
import { getDescendentInsideParent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendentInsideParent";
import { SyntaxNodeRef } from "@lezer/common";
import { SparkDeclaration } from "../../types/SparkDeclaration";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { SparkSelector } from "../../types/SparkSelector";
import { getCharacterIdentifier } from "../../utils/getCharacterIdentifier";
import { SparkdownAnnotation } from "../SparkdownAnnotation";
import { SparkdownAnnotator } from "../SparkdownAnnotator";

export interface Reference {
  usage?: "divert";
  declaration?:
    | "function"
    | "knot"
    | "stitch"
    | "label"
    | "const"
    | "var"
    | "temp"
    | "list"
    | "define"
    | "define_type_name"
    | "define_variable_name"
    | "param"
    | "property";
  kind?: "write" | "read";
  symbolIds?: string[];
  interdependentIds?: string[];
  firstMatchOnly?: boolean;
  selector?: SparkSelector;
  assigned?: SparkDeclaration;
  prop?: boolean;
  linkable?: boolean;
}

export class ReferenceAnnotator extends SparkdownAnnotator<
  SparkdownAnnotation<Reference>
> {
  defineModifier = "";

  defineType = "";

  defineName = "";

  definePropertyPathParts: {
    key: string | number;
    arrayLength?: number;
  }[] = [];

  divertPathParts: string[] = [];

  override start() {
    this.defineModifier = "";
    this.defineType = "";
    this.defineName = "";
    this.definePropertyPathParts = [];
    this.divertPathParts = [];
  }

  override enter(
    annotations: Range<SparkdownAnnotation<Reference>>[],
    nodeRef: SparkdownSyntaxNodeRef
  ): Range<SparkdownAnnotation<Reference>>[] {
    if (nodeRef.name === "FunctionDeclarationName") {
      annotations.push(
        SparkdownAnnotation.mark<Reference>({
          declaration: "function",
          symbolIds: [this.read(nodeRef.from, nodeRef.to)],
          kind: "write",
        }).range(nodeRef.from, nodeRef.to)
      );
      return annotations;
    }
    if (nodeRef.name === "KnotDeclarationName") {
      annotations.push(
        SparkdownAnnotation.mark<Reference>({
          declaration: "knot",
          symbolIds: [this.read(nodeRef.from, nodeRef.to)],
          kind: "write",
        }).range(nodeRef.from, nodeRef.to)
      );
      return annotations;
    }
    if (nodeRef.name === "StitchDeclarationName") {
      annotations.push(
        SparkdownAnnotation.mark<Reference>({
          declaration: "stitch",
          symbolIds: ["." + this.read(nodeRef.from, nodeRef.to)],
          kind: "write",
        }).range(nodeRef.from, nodeRef.to)
      );
      return annotations;
    }
    if (nodeRef.name === "LabelDeclarationName") {
      annotations.push(
        SparkdownAnnotation.mark<Reference>({
          declaration: "label",
          symbolIds: ["." + this.read(nodeRef.from, nodeRef.to)],
          kind: "write",
        }).range(nodeRef.from, nodeRef.to)
      );
      return annotations;
    }
    if (nodeRef.name === "VariableDeclarationName") {
      const context = getContextNames(nodeRef.node);
      if (context.includes("ConstDeclaration")) {
        annotations.push(
          SparkdownAnnotation.mark<Reference>({
            declaration: "const",
            symbolIds: [this.read(nodeRef.from, nodeRef.to)],
            kind: "write",
          }).range(nodeRef.from, nodeRef.to)
        );
        return annotations;
      }
      if (context.includes("VarDeclaration")) {
        annotations.push(
          SparkdownAnnotation.mark<Reference>({
            declaration: "var",
            symbolIds: [this.read(nodeRef.from, nodeRef.to)],
            kind: "write",
          }).range(nodeRef.from, nodeRef.to)
        );
        return annotations;
      }
      if (context.includes("TempDeclaration")) {
        annotations.push(
          SparkdownAnnotation.mark<Reference>({
            declaration: "temp",
            symbolIds: ["." + this.read(nodeRef.from, nodeRef.to)],
            kind: "write",
          }).range(nodeRef.from, nodeRef.to)
        );
        return annotations;
      }
    }
    if (nodeRef.name === "ListTypeDeclarationName") {
      const context = getContextNames(nodeRef.node);
      if (context.includes("ListDeclaration")) {
        annotations.push(
          SparkdownAnnotation.mark<Reference>({
            declaration: "list",
            symbolIds: [this.read(nodeRef.from, nodeRef.to)],
            kind: "write",
          }).range(nodeRef.from, nodeRef.to)
        );
        return annotations;
      }
    }
    if (nodeRef.name === "DefineIdentifier") {
      const context = getContextNames(nodeRef.node);
      if (context.includes("DefineDeclaration")) {
        annotations.push(
          SparkdownAnnotation.mark<Reference>({
            declaration: "define",
            kind: "write",
          }).range(nodeRef.from, nodeRef.to)
        );
        return annotations;
      }
    }
    if (nodeRef.name === "Parameter") {
      const context = getContextNames(nodeRef.node);
      if (
        !context.includes("FunctionCall") &&
        context.includes("FunctionParameters")
      ) {
        const functionNameNode = getDescendentInsideParent(
          "FunctionDeclarationName",
          "FunctionDeclaration",
          getContextStack(nodeRef.node)
        );
        if (functionNameNode) {
          annotations.push(
            SparkdownAnnotation.mark<Reference>({
              declaration: "param",
              symbolIds: [
                this.read(functionNameNode.from, functionNameNode.to) +
                  "." +
                  this.read(nodeRef.from, nodeRef.to),
              ],
              kind: "write",
            }).range(nodeRef.from, nodeRef.to)
          );
          return annotations;
        }
      }
    }
    if (nodeRef.name === "FunctionName") {
      annotations.push(
        SparkdownAnnotation.mark<Reference>({
          symbolIds: [this.read(nodeRef.from, nodeRef.to)],
          kind: "read",
        }).range(nodeRef.from, nodeRef.to)
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
        }).range(nodeRef.from, nodeRef.to)
      );
      return annotations;
    }
    if (nodeRef.name === "DefineDeclaration") {
      this.defineModifier = "";
      this.defineType = "";
      this.defineName = "";
      this.definePropertyPathParts = [{ key: "" }];
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
        }).range(nodeRef.from, nodeRef.to)
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
        }).range(nodeRef.from, nodeRef.to)
      );
      return annotations;
    }
    if (
      nodeRef.name === "StructScalarItem" ||
      nodeRef.name === "StructObjectItemBlock" ||
      nodeRef.name === "StructObjectItemWithInlineScalarProperty" ||
      nodeRef.name === "StructObjectItemWithInlineObjectProperty"
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
      nodeRef.name === "DeclarationScalarPropertyName" ||
      nodeRef.name === "DeclarationObjectPropertyName"
    ) {
      const name = this.read(nodeRef.from, nodeRef.to);
      this.definePropertyPathParts.push({
        key: name,
      });
      const propertyPath = this.definePropertyPathParts
        .map(({ key }) => key)
        .join(".");
      annotations.push(
        SparkdownAnnotation.mark<Reference>({
          declaration: "property",
          symbolIds: [
            this.defineType + "." + this.defineName + "." + propertyPath,
          ],
          interdependentIds:
            this.defineType === "style"
              ? [`ui..${name}`]
              : this.defineType === "ui"
              ? [`style.${name}`]
              : [],
          kind: "write",
        }).range(nodeRef.from, nodeRef.to)
      );
      return annotations;
    }
    if (nodeRef.name === "StructFieldValue") {
      // For type checking
      const defineProperty = this.definePropertyPathParts
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
        }).range(nodeRef.from, nodeRef.to)
      );
      // For finding references
      const value = this.read(nodeRef.from, nodeRef.to);
      const symbolIds =
        this.defineType === "character" && defineProperty === ".name"
          ? ["character.?.name=" + value.slice(1, -1)]
          : [];
      annotations.push(
        SparkdownAnnotation.mark<Reference>({
          symbolIds,
        }).range(nodeRef.from + 1, nodeRef.to - 1) // don't include surrounding string quotes in symbol range
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
        }).range(nodeRef.from, nodeRef.to)
      );
    }
    if (nodeRef.name === "VariableName") {
      const name = this.read(nodeRef.from, nodeRef.to);
      const context = getContextStack(nodeRef.node);
      const typeNameNode = getDescendentInsideParent(
        ["TypeName"],
        ["AccessPath", "ListTypeAssignment"],
        context
      );
      const types = typeNameNode
        ? [this.read(typeNameNode.from, typeNameNode.to)]
        : [];
      // Record reference in field value
      if (context.some((n) => n.name === "StructFieldValue")) {
        const defineProperty = this.definePropertyPathParts
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
              selector: { types, name },
              assigned: declaration,
              symbolIds: types.map((type) => `${type}.${name}`),
              kind: "read",
              linkable: true,
            }).range(nodeRef.from, nodeRef.to)
          );
          return annotations;
        } else {
          const name = this.read(nodeRef.from, nodeRef.to);
          annotations.push(
            SparkdownAnnotation.mark<Reference>({
              selector: { name },
              assigned: declaration,
              symbolIds: ["?" + "." + name], // will need to infer type later
              kind: "read",
              linkable: true,
            }).range(nodeRef.from, nodeRef.to)
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
            }).range(nodeRef.from, nodeRef.to)
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
            }).range(nodeRef.from, nodeRef.to)
          );
          return annotations;
        }
      }
    }
    if (nodeRef.name === "AssetCommandTarget") {
      const context = getContextNames(nodeRef.node);
      // Record image target reference
      if (context.includes("ImageCommand")) {
        const types: string[] = ["ui."]; // end type with dot for recursive prop search
        const name = this.read(nodeRef.from, nodeRef.to);
        const displayType = `ui element`;
        const fuzzy = true;
        annotations.push(
          SparkdownAnnotation.mark<Reference>({
            selector: {
              types,
              name,
              displayType,
              fuzzy,
            },
            symbolIds: types.map((type) => `${type}.${name}`),
            kind: "read",
            linkable: true,
            interdependentIds: [`style.${name}`],
          }).range(nodeRef.from, nodeRef.to)
        );
        return annotations;
      }
      // Record audio target reference
      if (context.includes("AudioCommand")) {
        const types = ["channel"];
        const name = this.read(nodeRef.from, nodeRef.to);
        annotations.push(
          SparkdownAnnotation.mark<Reference>({
            selector: { types, name },
            symbolIds: types.map((type) => `${type}.${name}`),
            kind: "read",
            linkable: true,
          }).range(nodeRef.from, nodeRef.to)
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
            selector: { types, name },
            symbolIds: types.map((type) => `${type}.${name}`),
            kind: "read",
            linkable: true,
          }).range(nodeRef.from, nodeRef.to)
        );
        return annotations;
      }
    }
    if (nodeRef.name === "AssetCommandName") {
      const context = getContextNames(nodeRef.node);
      // Record image name (and filter) reference
      if (context.includes("ImageCommand")) {
        const types = ["filtered_image", "layered_image", "image", "graphic"];
        const name = this.read(nodeRef.from, nodeRef.to);
        const displayType = "image";
        annotations.push(
          SparkdownAnnotation.mark<Reference>({
            selector: { types, name, displayType },
            symbolIds: types.map((type) => `${type}.${name}`),
            kind: "read",
            linkable: true,
          }).range(nodeRef.from, nodeRef.to)
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
        annotations.push(
          SparkdownAnnotation.mark<Reference>({
            symbolIds: types.map((type) => `${type}.${name}`),
            kind: "read",
            linkable: true,
          }).range(nodeRef.from, nodeRef.to)
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
            selector: { types, name, displayType },
            symbolIds: types.map((type) => `${type}.${name}`),
            kind: "read",
            linkable: true,
          }).range(nodeRef.from, nodeRef.to)
        );
        return annotations;
      }
    }
    if (nodeRef.name === "NameValue") {
      const context = getContextNames(nodeRef.node);
      if (context.includes("ImageCommand")) {
        const types = ["transition", "animation"];
        const name = this.read(nodeRef.from, nodeRef.to);
        const displayType = `transition or animation`;
        annotations.push(
          SparkdownAnnotation.mark<Reference>({
            selector: { types, name, displayType },
            symbolIds: types.map((type) => `${type}.${name}`),
            kind: "read",
            linkable: true,
          }).range(nodeRef.from, nodeRef.to)
        );
        return annotations;
      }
      if (context.includes("AudioCommand")) {
        const types = ["modulation"];
        const name = this.read(nodeRef.from, nodeRef.to);
        annotations.push(
          SparkdownAnnotation.mark<Reference>({
            selector: { types, name },
            symbolIds: types.map((type) => `${type}.${name}`),
            kind: "read",
            linkable: true,
          }).range(nodeRef.from, nodeRef.to)
        );
        return annotations;
      }
    }
    if (nodeRef.name === "DialogueCharacterName") {
      const name = this.read(nodeRef.from, nodeRef.to);
      annotations.push(
        SparkdownAnnotation.mark<Reference>({
          symbolIds: [
            "character." + name,
            "character.?.name=" + name,
            "character." + getCharacterIdentifier(name),
          ],
          kind: "read",
          linkable: true,
          firstMatchOnly: true,
        }).range(nodeRef.from, nodeRef.to)
      );
      return annotations;
    }
    return annotations;
  }

  override leave(
    annotations: Range<SparkdownAnnotation<Reference>>[],
    nodeRef: SyntaxNodeRef
  ): Range<SparkdownAnnotation<Reference>>[] {
    if (nodeRef.name === "DefineDeclaration") {
      this.defineModifier = "";
      this.defineType = "";
      this.defineName = "";
      this.definePropertyPathParts = [];
      return annotations;
    }
    if (
      nodeRef.name === "StructScalarItem" ||
      nodeRef.name === "StructObjectItemBlock" ||
      nodeRef.name === "StructObjectItemWithInlineScalarProperty" ||
      nodeRef.name === "StructObjectItemWithInlineObjectProperty" ||
      nodeRef.name === "StructObjectItemWithInlineScalarProperty_begin" ||
      nodeRef.name === "StructObjectItemWithInlineObjectProperty_end"
    ) {
      this.definePropertyPathParts.pop();
      return annotations;
    }
    if (
      nodeRef.name === "StructScalarProperty" ||
      nodeRef.name === "StructObjectProperty"
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
