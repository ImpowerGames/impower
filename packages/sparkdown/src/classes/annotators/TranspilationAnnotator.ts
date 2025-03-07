import { Range } from "@codemirror/state";
import { getContextNames } from "@impower/textmate-grammar-tree/src/tree/utils/getContextNames";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { uuid as UUID } from "../../utils/uuid";
import { SparkdownAnnotation } from "../SparkdownAnnotation";
import { SparkdownAnnotator } from "../SparkdownAnnotator";

const FLOW_MARKER_REGEX = /^([=])(.*?)([=])/;
const INDENT_REGEX: RegExp = /^[ \t]*/;

export interface LineAugmentations {
  uuid?: string;
  splice?: string;
  prefix?: string;
  suffix?: string;
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

  generateID() {
    return UUID();
  }

  getFlowMarker(id: string) {
    return `=${id}=`;
  }

  override enter(
    annotations: Range<SparkdownAnnotation<LineAugmentations>>[],
    nodeRef: SparkdownSyntaxNodeRef
  ): Range<SparkdownAnnotation<LineAugmentations>>[] {
    // Annotate dialogue line with implicit flow marker
    if (
      nodeRef.name === "BlockDialogue_begin" ||
      nodeRef.name === "BlockWrite_begin"
    ) {
      const lineFrom = this.getLineAt(nodeRef.from).from;
      const lineTextBefore = this.read(lineFrom, nodeRef.to);
      const uuid = this.generateID();
      const flowMarker = this.getFlowMarker(uuid);
      const colonSeparator =
        lineTextBefore.trimStart().length === 1 ? " : " : ": ";
      const splice = colonSeparator + flowMarker + "\\";
      this.blockPrefix = lineTextBefore;
      annotations.push(
        SparkdownAnnotation.mark({ uuid, splice }).range(
          nodeRef.from,
          nodeRef.to
        )
      );
    }
    // Annotate dialogue line with implicit character name and flow marker
    if (
      nodeRef.name === "BlockLineContinue" ||
      nodeRef.name === "BlockLineBreak"
    ) {
      if (this.prevNodeType.startsWith("BlockLineBreak")) {
        const blockPrefix = this.blockPrefix + ": ";
        const uuid = this.generateID();
        const flowMarker = this.getFlowMarker(uuid);
        const prefix = blockPrefix + flowMarker;
        annotations.push(
          SparkdownAnnotation.mark({ uuid, prefix }).range(
            nodeRef.from,
            nodeRef.to
          )
        );
      }
    }
    // Annotate line with implicit flow marker
    if (
      nodeRef.name === "InlineDialogue_begin" ||
      nodeRef.name === "InlineWrite_begin" ||
      nodeRef.name === "Transition_begin" ||
      nodeRef.name === "Scene_begin" ||
      nodeRef.name === "Action_begin"
    ) {
      const lineFrom = this.getLineAt(nodeRef.from).from;
      const lineTo = this.getLineAt(nodeRef.from).to;
      const lineTextBefore = this.read(lineFrom, nodeRef.to);
      const lineTextAfter = this.read(nodeRef.to, lineTo);
      if (
        !lineTextAfter.match(FLOW_MARKER_REGEX) &&
        !lineTextBefore.trim().endsWith("<>")
      ) {
        const uuid = this.generateID();
        const flowMarker = this.getFlowMarker(uuid);
        const splice = flowMarker;
        annotations.push(
          SparkdownAnnotation.mark({ uuid, splice }).range(
            nodeRef.from,
            nodeRef.to
          )
        );
      }
    }
    if (
      (nodeRef.name === "ImageLine" ||
        nodeRef.name === "AudioLine" ||
        nodeRef.name === "ImageAndAudioLine") &&
      getContextNames(nodeRef.node).length === 1
    ) {
      const lineFrom = this.getLineAt(nodeRef.from).from;
      const lineTo = this.getLineAt(nodeRef.from).to;
      const lineTextBefore = this.read(lineFrom, nodeRef.to);
      const lineTextAfter = this.read(nodeRef.to, lineTo);
      if (
        !lineTextAfter.match(FLOW_MARKER_REGEX) &&
        !lineTextBefore.trim().endsWith("<>")
      ) {
        const uuid = this.generateID();
        const flowMarker = this.getFlowMarker(uuid);
        const splice = flowMarker;
        annotations.push(
          SparkdownAnnotation.mark({ uuid, splice }).range(
            nodeRef.from,
            nodeRef.to
          )
        );
      }
    }
    // Record explicit flow marker's source location
    if (nodeRef.name === "UUID") {
      const uuid = this.read(nodeRef.from, nodeRef.to).trim();
      if (uuid) {
        annotations.push(
          SparkdownAnnotation.mark({ uuid }).range(nodeRef.from, nodeRef.to)
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
        if (nextLineText.startsWith(indent)) {
          // All lines (except the last in a block) should end with implicit \
          // (So they are grouped together with following text line)
          const suffix = " \\";
          annotations.push(
            SparkdownAnnotation.mark({ suffix }).range(nodeRef.from, nodeRef.to)
          );
          return annotations;
        }
      }
    }
    return annotations;
  }
}
