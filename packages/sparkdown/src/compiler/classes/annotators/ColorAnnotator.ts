import { Range } from "@codemirror/state";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { SparkdownAnnotation } from "../SparkdownAnnotation";
import { SparkdownAnnotator } from "../SparkdownAnnotator";

export interface ColorInfo {
  possibleColorReference?: boolean;
  declaration?: {
    modifier: string;
    type: string;
    name: string;
    property: string;
  };
}

export class ColorAnnotator extends SparkdownAnnotator<
  SparkdownAnnotation<ColorInfo>
> {
  defineModifier = "";

  defineType = "";

  defineName = "";

  definePropertyPathParts: {
    key?: string | number;
    arrayLength?: number;
  }[] = [];

  override begin() {
    this.defineModifier = "";
    this.defineType = "";
    this.defineName = "";
    this.definePropertyPathParts = [];
  }

  override enter(
    annotations: Range<SparkdownAnnotation<ColorInfo>>[],
    nodeRef: SparkdownSyntaxNodeRef,
  ): Range<SparkdownAnnotation<ColorInfo>>[] {
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
      return annotations;
    }
    if (nodeRef.name === "DefineVariableName") {
      this.defineName = this.read(nodeRef.from, nodeRef.to);
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
      return annotations;
    }
    if (nodeRef.name === "Color") {
      annotations.push(
        SparkdownAnnotation.mark({}).range(nodeRef.from, nodeRef.to),
      );
      return annotations;
    }
    if (
      nodeRef.name === "StylingStringIdentifier" ||
      nodeRef.name === "ParameterStringIdentifier"
    ) {
      const propertyPath = this.definePropertyPathParts
        .filter((p) => p.key != null)
        .map(({ key }) => key)
        .join(".");
      const declaration = this.defineName
        ? {
            modifier: this.defineModifier,
            type: this.defineType,
            name: this.defineName,
            property: propertyPath,
          }
        : undefined;
      annotations.push(
        SparkdownAnnotation.mark({
          possibleColorReference: true,
          declaration,
        }).range(nodeRef.from, nodeRef.to),
      );
      return annotations;
    }
    return annotations;
  }

  override leave(
    annotations: Range<SparkdownAnnotation<ColorInfo>>[],
    nodeRef: SparkdownSyntaxNodeRef,
  ): Range<SparkdownAnnotation<ColorInfo>>[] {
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
    return annotations;
  }
}
