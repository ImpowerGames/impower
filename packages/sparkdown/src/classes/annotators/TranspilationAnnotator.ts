import { Range } from "@codemirror/state";
import { type GrammarSyntaxNode } from "@impower/textmate-grammar-tree/src/tree/types/GrammarSyntaxNode";
import { getDescendents } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendents";
import { type SparkdownNodeName } from "../../types/SparkdownNodeName";
import { type SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { SparkdownAnnotation } from "../SparkdownAnnotation";
import { SparkdownAnnotator } from "../SparkdownAnnotator";

export interface LineAugmentations {
  splice?: string;
  suffix?: string;
  remove?: boolean;
  whiteout?: boolean;
}

export class TranspilationAnnotator extends SparkdownAnnotator<
  SparkdownAnnotation<LineAugmentations>
> {
  blockPrefix = "";

  prevBlockLineType = "";

  parentBlockNode?: GrammarSyntaxNode<SparkdownNodeName> = undefined;

  blockLineNodes?: GrammarSyntaxNode<SparkdownNodeName>[] = [];

  override begin() {
    this.blockPrefix = "";
    this.prevBlockLineType = "";
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
    if (
      nodeRef.name === "BlockTitle" ||
      nodeRef.name === "BlockHeading" ||
      nodeRef.name === "BlockTransitional" ||
      nodeRef.name === "BlockWrite" ||
      nodeRef.name === "BlockDialogue" ||
      nodeRef.name === "BlockAction"
    ) {
      this.parentBlockNode = nodeRef.node;
      this.blockLineNodes = getDescendents(
        ["BlockLineContinue", "BlockLineBreak"],
        nodeRef.node
      );
    }

    // Insert implicit chain escape to continue this box on a new line
    if (
      nodeRef.name === "BlockTitle_begin" ||
      nodeRef.name === "BlockHeading_begin" ||
      nodeRef.name === "BlockTransitional_begin" ||
      nodeRef.name === "BlockWrite_begin" ||
      nodeRef.name === "BlockDialogue_begin" ||
      nodeRef.name === "BlockAction_begin"
    ) {
      const lineFrom = this.getLineAt(nodeRef.from).from;
      const lineTextBefore = this.read(lineFrom, nodeRef.to);
      this.blockPrefix = lineTextBefore;
      // Check that this line is not the last in the block
      const lastBlockLineNode = this.blockLineNodes?.at(-1);
      if (lastBlockLineNode && lastBlockLineNode.to > nodeRef.to) {
        const splice = "\\ ";
        annotations.push(
          SparkdownAnnotation.mark({ splice }).range(nodeRef.to, nodeRef.to)
        );
      }
    }
    // Insert implicit block prefix before line to break it into a new box
    if (
      nodeRef.name === "BlockLineContinue" ||
      nodeRef.name === "BlockLineBreak"
    ) {
      if (this.prevBlockLineType.startsWith("BlockLineBreak")) {
        const blockPrefix = this.blockPrefix;
        const splice = blockPrefix;
        annotations.push(
          SparkdownAnnotation.mark({ splice }).range(nodeRef.from, nodeRef.from)
        );
      }
    }
    if (
      nodeRef.name === "BlockLineContinue" ||
      nodeRef.name === "BlockLineBreak"
    ) {
      this.prevBlockLineType = nodeRef.name;
    }
    return annotations;
  }

  override leave(
    annotations: Range<SparkdownAnnotation<LineAugmentations>>[],
    nodeRef: SparkdownSyntaxNodeRef
  ): Range<SparkdownAnnotation<LineAugmentations>>[] {
    if (
      nodeRef.name === "BlockTitle_end" ||
      nodeRef.name === "BlockHeading_end" ||
      nodeRef.name === "BlockTransitional_end" ||
      nodeRef.name === "BlockWrite_end" ||
      nodeRef.name === "BlockDialogue_end" ||
      nodeRef.name === "BlockAction_end"
    ) {
      this.blockPrefix = "";
      return annotations;
    }
    // Insert implicit chain escape to continue this box on a new line
    if (nodeRef.name === "BlockLineContinue") {
      const lineFrom = this.getLineAt(nodeRef.from).from;
      const lineTo = this.getLineAt(nodeRef.from).to;
      const lineTextBefore = this.read(lineFrom, nodeRef.to);
      const lineTextAfter = this.read(nodeRef.to, lineTo);
      if (
        !lineTextBefore.trim().endsWith("\\") &&
        !lineTextAfter.trim().startsWith("\\")
      ) {
        // Check that this line is not the last in the block
        const lastBlockLineNode = this.blockLineNodes?.at(-1);
        if (lastBlockLineNode && lastBlockLineNode.to > nodeRef.to) {
          // All lines (except the last in a block) should end with implicit \
          // (So they are grouped together with following text line)
          const suffix = " \\ ";
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
