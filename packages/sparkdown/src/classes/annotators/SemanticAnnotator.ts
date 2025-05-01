import { Range } from "@codemirror/state";
import { getContextStack } from "@impower/textmate-grammar-tree/src/tree/utils/getContextStack";
import { getNodesInsideParent } from "@impower/textmate-grammar-tree/src/tree/utils/getNodesInsideParent";
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

  inViewField = false;

  inFunctionDeclarationParameters = false;

  inFunctionParameters = false;

  inViewDeclarationAsExpression = false;

  inViewDeclarationControlExpression = false;

  indentStack: { inScope: string[]; indent: number }[] = [];

  override begin(): void {
    this.nesting = 0;
    this.defineName = "";
    this.inLinkMap = false;
  }

  override enter(
    annotations: Range<SparkdownAnnotation<SemanticInfo>>[],
    nodeRef: SparkdownSyntaxNodeRef
  ): Range<SparkdownAnnotation<SemanticInfo>>[] {
    if (nodeRef.name === "FunctionDeclarationParameters") {
      this.inFunctionDeclarationParameters = true;
    }
    if (nodeRef.name === "ViewField") {
      this.inViewField = true;
    }
    if (nodeRef.name === "Indent") {
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
              }).range(nodeRef.from, nodeRef.to)
            );
            const stack = getContextStack(nodeRef.node);
            const variableNameNodes = getNodesInsideParent(
              "VariableName",
              "NamespaceAccessor",
              stack
            );
            for (const variableNameNode of variableNameNodes) {
              annotations.push(
                SparkdownAnnotation.mark<SemanticInfo>({
                  tokenType: "variable",
                }).range(variableNameNode.from, variableNameNode.to)
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
    if (nodeRef.name === "FunctionDeclarationParameters") {
      this.inFunctionDeclarationParameters = false;
    }
    if (nodeRef.name === "ViewField") {
      this.inViewField = false;
    }
    if (nodeRef.name === "ViewDeclarationAsExpression") {
      this.inViewDeclarationAsExpression = false;
    }
    if (nodeRef.name === "ViewDeclarationControlExpression") {
      this.inViewDeclarationControlExpression = false;
    }
    if (
      nodeRef.name === "ScreenDeclaration" ||
      nodeRef.name === "ComponentDeclaration" ||
      nodeRef.name === "CssDeclaration"
    ) {
      this.inViewDeclarationAsExpression = false;
      this.inViewDeclarationControlExpression = false;
      this.inViewField = false;
      this.indentStack.length = 0;
    }
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
