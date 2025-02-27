import { Range } from "@codemirror/state";
import { getContext } from "@impower/textmate-grammar-tree/src/tree/utils/getContext";
import { SyntaxNodeRef } from "@lezer/common";
import { SparkDeclaration } from "../../types/SparkDeclaration";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { SparkSelector } from "../../types/SparkSelector";
import { SparkdownAnnotation } from "../SparkdownAnnotation";
import { SparkdownAnnotator } from "../SparkdownAnnotator";

export interface SparkReference {
  selector?: SparkSelector;
  declaration?: SparkDeclaration;
  prop?: boolean;
}

export class ReferenceAnnotator extends SparkdownAnnotator<
  SparkdownAnnotation<SparkReference>
> {
  defineModifier = "";

  defineType = "";

  defineName = "";

  definePropertyPathParts: {
    key: string | number;
    arrayLength?: number;
  }[] = [];

  override start() {
    this.defineModifier = "";
    this.defineType = "";
    this.defineName = "";
    this.definePropertyPathParts = [];
  }

  override enter(
    annotations: Range<SparkdownAnnotation<SparkReference>>[],
    nodeRef: SparkdownSyntaxNodeRef
  ): Range<SparkdownAnnotation<SparkReference>>[] {
    if (nodeRef.name === "DefineVariableName") {
      this.defineName = this.read(nodeRef.from, nodeRef.to);
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
      this.definePropertyPathParts.push({
        key: this.read(nodeRef.from, nodeRef.to),
      });
      return annotations;
    }
    if (nodeRef.name === "StructFieldValue") {
      const defineProperty = this.definePropertyPathParts
        .map((p) => p.key)
        .join(".");
      const declaration = {
        modifier: this.defineModifier,
        type: this.defineType,
        name: this.defineName,
        property: defineProperty,
      };
      // Record property declaration for type checking
      annotations.push(
        SparkdownAnnotation.mark({ declaration, prop: true }).range(
          nodeRef.from,
          nodeRef.to
        )
      );
      return annotations;
    }
    if (nodeRef.name === "AccessPath") {
      const context = getContext(nodeRef.node);
      // Record reference in field value
      if (context.includes("StructFieldValue")) {
        let [type, name] = this.read(nodeRef.from, nodeRef.to).split(".");
        if (type && !name) {
          name = type;
          type = "";
        }
        const defineProperty = this.definePropertyPathParts
          .map((p) => p.key)
          .join(".");
        const declaration = {
          modifier: this.defineModifier,
          type: this.defineType,
          name: this.defineName,
          property: defineProperty,
        };
        if (type) {
          const types = [type];
          annotations.push(
            SparkdownAnnotation.mark({
              selector: { types, name },
              declaration,
            }).range(nodeRef.from, nodeRef.to)
          );
          return annotations;
        } else {
          const name = this.read(nodeRef.from, nodeRef.to);
          annotations.push(
            SparkdownAnnotation.mark({
              selector: { name },
              declaration,
            }).range(nodeRef.from, nodeRef.to)
          );
          return annotations;
        }
      }
    }
    if (nodeRef.name === "AssetCommandTarget") {
      const context = getContext(nodeRef.node);
      // Record image target reference
      if (context.includes("ImageCommand")) {
        const types: string[] = ["ui."];
        const name = this.read(nodeRef.from, nodeRef.to);
        const displayType = `ui element`;
        const fuzzy = true;
        annotations.push(
          SparkdownAnnotation.mark({
            selector: {
              types,
              name,
              displayType,
              fuzzy,
            },
          }).range(nodeRef.from, nodeRef.to)
        );
        return annotations;
      }
      // Record audio target reference
      if (context.includes("AudioCommand")) {
        const types = ["channel"];
        const name = this.read(nodeRef.from, nodeRef.to);
        annotations.push(
          SparkdownAnnotation.mark({ selector: { types, name } }).range(
            nodeRef.from,
            nodeRef.to
          )
        );
        return annotations;
      }
    }
    if (nodeRef.name === "AssetCommandFilterName") {
      const context = getContext(nodeRef.node);
      // Record image filter reference
      if (context.includes("ImageCommand")) {
        const types = ["filter"];
        const name = this.read(nodeRef.from, nodeRef.to);
        annotations.push(
          SparkdownAnnotation.mark({ selector: { types, name } }).range(
            nodeRef.from,
            nodeRef.to
          )
        );
        return annotations;
      }
    }
    if (nodeRef.name === "AssetCommandFileName") {
      const context = getContext(nodeRef.node);
      // Record image file name reference
      if (context.includes("ImageCommand")) {
        const types = ["filtered_image", "layered_image", "image", "graphic"];
        const name = this.read(nodeRef.from, nodeRef.to);
        const displayType = "image";
        annotations.push(
          SparkdownAnnotation.mark({
            selector: { types, name, displayType },
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
          SparkdownAnnotation.mark({
            selector: { types, name, displayType },
          }).range(nodeRef.from, nodeRef.to)
        );
        return annotations;
      }
    }
    if (nodeRef.name === "NameValue") {
      const context = getContext(nodeRef.node);
      if (context.includes("ImageCommand")) {
        const types = ["transition", "animation"];
        const name = this.read(nodeRef.from, nodeRef.to);
        const displayType = `transition or animation`;
        annotations.push(
          SparkdownAnnotation.mark({
            selector: { types, name, displayType },
          }).range(nodeRef.from, nodeRef.to)
        );
        return annotations;
      }
      if (context.includes("AudioCommand")) {
        const types = ["modulation"];
        const name = this.read(nodeRef.from, nodeRef.to);
        annotations.push(
          SparkdownAnnotation.mark({ selector: { types, name } }).range(
            nodeRef.from,
            nodeRef.to
          )
        );
        return annotations;
      }
    }
    return annotations;
  }

  override leave(
    annotations: Range<SparkdownAnnotation<SparkReference>>[],
    nodeRef: SyntaxNodeRef
  ): Range<SparkdownAnnotation<SparkReference>>[] {
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
    return annotations;
  }
}
