import { Range } from "@codemirror/state";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { ErrorType } from "../../inkjs/compiler/Parser/ErrorType";
import { InkParser } from "../../inkjs/compiler/Parser/InkParser";
import { ParsedObject } from "../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { SourceMetadata } from "../../inkjs/engine/Error";
import { type SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { SparkdownAnnotation } from "../SparkdownAnnotation";
import { SparkdownAnnotator } from "../SparkdownAnnotator";

const FILE_HANDLER = {
  ResolveInkFilename: () => "",
  LoadInkFileContents: () => "",
};
const ROOT_PARSER = new InkParser("", null, null, null, FILE_HANDLER);

export interface InkDiagnostic {
  message: string;
  severity: ErrorType;
  source: SourceMetadata | null;
}

export interface CompiledBlock {
  diagnostics?: InkDiagnostic[];
  content?: ParsedObject[];
  include?: string;
}

export class CompilationAnnotator extends SparkdownAnnotator<
  SparkdownAnnotation<CompiledBlock>
> {
  override enter(
    annotations: Range<SparkdownAnnotation<CompiledBlock>>[],
    nodeRef: SparkdownSyntaxNodeRef
  ): Range<SparkdownAnnotation<CompiledBlock>>[] {
    if (
      nodeRef.node.parent?.type.isTop &&
      nodeRef.name !== "Newline" &&
      nodeRef.name !== "Whitespace" &&
      nodeRef.name !== "FrontMatter" &&
      nodeRef.name !== "ScreenDeclaration" &&
      nodeRef.name !== "ComponentDeclaration" &&
      nodeRef.name !== "StyleDeclaration" &&
      nodeRef.name !== "AnimationDeclaration" &&
      nodeRef.name !== "ThemeDeclaration"
    ) {
      if (nodeRef.name === "Include") {
        const includeContentNode = getDescendent(
          "IncludeContent",
          nodeRef.node
        );
        if (includeContentNode) {
          const includeFilePath = this.read(
            includeContentNode.from,
            includeContentNode.to
          );
          annotations.push(
            SparkdownAnnotation.mark({
              include: includeFilePath,
            }).range(nodeRef.from, nodeRef.to)
          );
        }
      } else {
        const text = this.read(nodeRef.from, nodeRef.to);
        const diagnostics: InkDiagnostic[] = [];
        const parser = new InkParser(
          text,
          null,
          (
            message: string,
            severity: ErrorType,
            source: SourceMetadata | null
          ) => {
            diagnostics.push({ message, severity, source });
          },
          ROOT_PARSER,
          FILE_HANDLER
        );
        const story = parser.ParseStory();
        annotations.push(
          SparkdownAnnotation.mark({
            diagnostics,
            content: story.content,
          }).range(nodeRef.from, nodeRef.to)
        );
      }
    }
    return annotations;
  }
}
