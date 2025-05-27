import { Range } from "@codemirror/state";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { SparkdownAnnotation } from "../SparkdownAnnotation";
import { SparkdownAnnotator } from "../SparkdownAnnotator";

const INDENT_REGEX: RegExp = /^[ \t]*/;

export interface LineAugmentations {
  splice?: string;
  prefix?: string;
  suffix?: string;
  remove?: boolean;
  whiteout?: boolean;
}

export class TranspilationAnnotator extends SparkdownAnnotator<
  SparkdownAnnotation<LineAugmentations>
> {
  blockPrefix = "";

  prevNodeType = "";

  override begin() {
    this.blockPrefix = "";
    this.prevNodeType = "";
  }

  override enter(
    annotations: Range<SparkdownAnnotation<LineAugmentations>>[],
    nodeRef: SparkdownSyntaxNodeRef
  ): Range<SparkdownAnnotation<LineAugmentations>>[] {
    if (
      nodeRef.name === "FrontMatter" ||
      nodeRef.name === "ScreenDeclaration" ||
      nodeRef.name === "ComponentDeclaration" ||
      nodeRef.name === "StyleDeclaration" ||
      nodeRef.name === "AnimationDeclaration" ||
      nodeRef.name === "ThemeDeclaration"
    ) {
      annotations.push(
        SparkdownAnnotation.mark({
          whiteout: true,
        }).range(nodeRef.from, nodeRef.to)
      );
    }
    if (nodeRef.name === "Break") {
      annotations.push(
        SparkdownAnnotation.mark({
          remove: true,
        }).range(nodeRef.from, nodeRef.to)
      );
    }
    // Annotate dialogue line with implicit flow marker
    if (
      nodeRef.name === "BlockDialogue_begin" ||
      nodeRef.name === "BlockWrite_begin"
    ) {
      const lineFrom = this.getLineAt(nodeRef.from).from;
      const lineTextBefore = this.read(lineFrom, nodeRef.to);
      const colonSeparator =
        lineTextBefore.trimStart().length === 1 ? " : " : ": ";
      const splice = colonSeparator + "\\";
      this.blockPrefix = lineTextBefore;
      annotations.push(
        SparkdownAnnotation.mark({ splice }).range(nodeRef.to, nodeRef.to)
      );
    }
    // Annotate dialogue line with implicit character name and flow marker
    if (
      nodeRef.name === "BlockLineContinue" ||
      nodeRef.name === "BlockLineBreak"
    ) {
      if (this.prevNodeType.startsWith("BlockLineBreak")) {
        const blockPrefix = this.blockPrefix + ": ";
        const prefix = blockPrefix;
        annotations.push(
          SparkdownAnnotation.mark({ prefix }).range(nodeRef.from, nodeRef.from)
        );
      }
    }
    if (nodeRef.name !== "Newline") {
      this.prevNodeType = nodeRef.name;
    }
    return annotations;
  }

  override leave(
    annotations: Range<SparkdownAnnotation<LineAugmentations>>[],
    nodeRef: SparkdownSyntaxNodeRef
  ): Range<SparkdownAnnotation<LineAugmentations>>[] {
    if (
      nodeRef.name === "BlockDialogue_end" ||
      nodeRef.name === "BlockWrite_end"
    ) {
      this.blockPrefix = "";
      return annotations;
    }
    if (nodeRef.name === "BlockLineContinue") {
      const lineFrom = this.getLineAt(nodeRef.from).from;
      const lineTo = this.getLineAt(nodeRef.from).to;
      const lineTextBefore = this.read(lineFrom, nodeRef.to);
      const lineTextAfter = this.read(nodeRef.to, lineTo);
      if (
        !lineTextBefore.trim().endsWith("\\") &&
        !lineTextAfter.trim().startsWith("\\")
      ) {
        const indentMatch = lineTextBefore.match(INDENT_REGEX);
        const indent = indentMatch?.[0] || "";
        const nextLineText = this.readNextLine(nodeRef.from);
        // Check that this dialogue line is not the last in the block
        if (nextLineText.trim() && nextLineText.startsWith(indent)) {
          // All lines (except the last in a block) should end with implicit \
          // (So they are grouped together with following text line)
          const suffix = " \\";
          annotations.push(
            SparkdownAnnotation.mark({ suffix }).range(nodeRef.to, nodeRef.to)
          );
          return annotations;
        }
      }
    }
    return annotations;
  }
}
