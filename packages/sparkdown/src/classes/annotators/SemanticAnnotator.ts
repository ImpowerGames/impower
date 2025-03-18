import { Range } from "@codemirror/state";
import { SyntaxNodeRef } from "@lezer/common";
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
  possibleDivertPath?: boolean;
  tokenType: SemanticTokenTypes;
  tokenModifiers?: SemanticTokenModifiers[];
}

export class SemanticAnnotator extends SparkdownAnnotator<
  SparkdownAnnotation<SemanticInfo>
> {
  nesting = 0;

  defineName = "";

  inLinkMap = false;

  override begin(): void {
    this.nesting = 0;
    this.defineName = "";
    this.inLinkMap = false;
  }

  override enter(
    annotations: Range<SparkdownAnnotation<SemanticInfo>>[],
    nodeRef: SparkdownSyntaxNodeRef
  ): Range<SparkdownAnnotation<SemanticInfo>>[] {
    if (nodeRef.name === "DefineVariableName") {
      const text = this.read(nodeRef.from, nodeRef.to);
      if (text) {
        this.defineName = text;
      }
    }
    if (nodeRef.name === "StructField") {
      this.nesting++;
    }
    if (nodeRef.name === "DeclarationObjectPropertyName") {
      if (this.nesting <= 1) {
        this.inLinkMap = false;
      }
      if (this.inLinkMap) {
        annotations.push(
          SparkdownAnnotation.mark<SemanticInfo>({
            tokenType: "struct",
          }).range(nodeRef.from, nodeRef.to)
        );
      }
    }
    if (nodeRef.name === "AccessPath") {
      annotations.push(
        SparkdownAnnotation.mark<SemanticInfo>({
          tokenType: "keyword",
          possibleDivertPath: true,
        }).range(nodeRef.from, nodeRef.to)
      );
    }
    return annotations;
  }

  override leave(
    annotations: Range<SparkdownAnnotation<SemanticInfo>>[],
    nodeRef: SyntaxNodeRef
  ): Range<SparkdownAnnotation<SemanticInfo>>[] {
    if (nodeRef.name === "DefineDeclaration") {
      this.defineName = "";
    }
    if (nodeRef.name === "StructField") {
      this.nesting--;
    }
    if (nodeRef.name === "DeclarationObjectPropertyName") {
      if (this.nesting === 1) {
        if (
          !this.defineName &&
          this.read(nodeRef.from, nodeRef.to) === "link"
        ) {
          this.inLinkMap = true;
          annotations.push(
            SparkdownAnnotation.mark<SemanticInfo>({
              tokenType: "macro",
            }).range(nodeRef.from, nodeRef.to)
          );
        } else {
          this.inLinkMap = false;
        }
      }
    }
    return annotations;
  }
}
