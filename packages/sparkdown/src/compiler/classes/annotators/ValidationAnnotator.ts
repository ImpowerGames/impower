import { Range } from "@codemirror/state";
import { getContextNames } from "@impower/textmate-grammar-tree/src/tree/utils/getContextNames";
import GRAMMAR_DEFINITION from "../../../../language/sparkdown.language-grammar.json";
import { SparkdownNodeName } from "../../types/SparkdownNodeName";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { formatList } from "../../utils/formatList";
import { SparkdownAnnotation } from "../SparkdownAnnotation";
import { SparkdownAnnotator } from "../SparkdownAnnotator";

const IMAGE_CONTROL_KEYWORDS =
  GRAMMAR_DEFINITION.variables.IMAGE_CONTROL_KEYWORDS || [];
const AUDIO_CONTROL_KEYWORDS =
  GRAMMAR_DEFINITION.variables.AUDIO_CONTROL_KEYWORDS || [];

// NOTE: This annotator previously also validated property selectors
// (`PropertySelectorSimpleConditionName`/`...FunctionConditionName`/
// `PropertySelectorConstant`), reserved define names (`DefineVariableName`),
// and `InvalidFieldValue`. The Luau port restructured the selector grammar
// (now `SimpleSelectorFunction`/`RecursiveSelectorFunction`/
// `SelectorPropertyNamePart`, bad names caught by `InvalidSelectorPropertyName`)
// and typed field values (`Numeric/Boolean/String/UnquotedStringFieldValue`),
// so those node names no longer exist — the branches were dead. They were
// removed (along with the `ConditionalBracedBlock` value-type checks: the
// asset-clause value position now only admits TimeValue/NumberValue/NameValue,
// so no conditional node appears there). Only the asset-command validations
// below remain live.

export interface Diagnostic {
  message?: string;
  severity?: "info" | "warning" | "error";
}

export class ValidationAnnotator extends SparkdownAnnotator<
  SparkdownAnnotation<Diagnostic>
> {
  override enter(
    annotations: Range<SparkdownAnnotation<Diagnostic>>[],
    nodeRef: SparkdownSyntaxNodeRef,
  ): Range<SparkdownAnnotation<Diagnostic>>[] {
    if (nodeRef.name === "AssetCommandFilterName") {
      const context = getContextNames(nodeRef.node);
      // Record audio filter reference
      if (context.includes("AudioCommand")) {
        // TODO: Validate synth tone format
      }
      return annotations;
    }
    if (nodeRef.name === "AssetCommandControl") {
      const context = getContextNames(nodeRef.node);
      // Report invalid image control
      if (
        context.includes("ImageCommand") &&
        !IMAGE_CONTROL_KEYWORDS.includes(this.read(nodeRef.from, nodeRef.to))
      ) {
        const message = `Unrecognized visual control: Visual commands only support ${formatList(
          IMAGE_CONTROL_KEYWORDS,
        )}`;
        annotations.push(
          SparkdownAnnotation.mark<Diagnostic>({ message }).range(
            nodeRef.from,
            nodeRef.to,
          ),
        );
        return annotations;
      }
      // Report invalid audio control
      if (
        context.includes("AudioCommand") &&
        !AUDIO_CONTROL_KEYWORDS.includes(this.read(nodeRef.from, nodeRef.to))
      ) {
        const message = `Unrecognized audio control: Audio commands only support ${formatList(
          AUDIO_CONTROL_KEYWORDS,
        )}`;
        annotations.push(
          SparkdownAnnotation.mark<Diagnostic>({ message }).range(
            nodeRef.from,
            nodeRef.to,
          ),
        );
        return annotations;
      }
    }
    if (nodeRef.name === "IllegalChar") {
      const context = getContextNames(nodeRef.node);
      // Report invalid image name syntax
      if (context.includes("ImageCommand")) {
        const message = `Invalid syntax`;
        annotations.push(
          SparkdownAnnotation.mark<Diagnostic>({
            message,
            severity: "error",
          }).range(nodeRef.from, nodeRef.to),
        );
        return annotations;
      }
      // Report invalid audio name syntax
      if (context.includes("AudioCommand")) {
        const message = `Invalid syntax`;
        annotations.push(
          SparkdownAnnotation.mark<Diagnostic>({
            message,
            severity: "error",
          }).range(nodeRef.from, nodeRef.to),
        );
        return annotations;
      }
    }
    if (nodeRef.name === "AssetCommandClauseKeyword") {
      const text = this.read(nodeRef.from, nodeRef.to);
      const nextNonWhitespacePos = this.getNextNonWhitespacePos(nodeRef.to);
      const nextValueNode = nodeRef.node.nextSibling?.node.nextSibling;
      const nextValueNodeType = (
        nextValueNode ? nextValueNode.type.name : ""
      ) as SparkdownNodeName;
      const nextValueNodeText = nextValueNode
        ? this.read(nextValueNode.from, nextValueNode.to)
        : "";
      if (text === "after") {
        if (
          nextValueNodeType !== "TimeValue" &&
          nextValueNodeType !== "NumberValue"
        ) {
          const message = `\`${text}\` should be followed by a time value\n> e.g. \`after 2\`, \`after 2s\`, \`after 200ms\``;
          const errorFrom = nextValueNode
            ? nextValueNode.from
            : nextNonWhitespacePos;
          const errorTo = nextValueNode
            ? nextValueNode.to
            : nextNonWhitespacePos;
          annotations.push(
            SparkdownAnnotation.mark<Diagnostic>({
              message,
              severity: "error",
            }).range(errorFrom, errorTo),
          );
          return annotations;
        }
      }
      if (text === "over") {
        if (
          nextValueNodeType !== "TimeValue" &&
          nextValueNodeType !== "NumberValue"
        ) {
          const message = `\`${text}\` should be followed by a time value\n> e.g. \`over 2\`, \`over 2s\`, \`over 200ms\``;
          const errorFrom = nextValueNode
            ? nextValueNode.from
            : nextNonWhitespacePos;
          const errorTo = nextValueNode
            ? nextValueNode.to
            : nextNonWhitespacePos;
          annotations.push(
            SparkdownAnnotation.mark<Diagnostic>({
              message,
              severity: "error",
            }).range(errorFrom, errorTo),
          );
          return annotations;
        }
      }
      if (text === "with") {
        const context = getContextNames(nodeRef.node);
        if (
          context.includes("ImageCommand") &&
          nextValueNodeType !== "NameValue"
        ) {
          const message = `\`${text}\` should be followed by the name of a transition or animation\n> e.g. \`with shake\``;
          const errorFrom = nextValueNode
            ? nextValueNode.from
            : nextNonWhitespacePos;
          const errorTo = nextValueNode
            ? nextValueNode.to
            : nextNonWhitespacePos;
          annotations.push(
            SparkdownAnnotation.mark<Diagnostic>({
              message,
              severity: "error",
            }).range(errorFrom, errorTo),
          );
          return annotations;
        }
        if (
          context.includes("AudioCommand") &&
          nextValueNodeType !== "NameValue"
        ) {
          const message =
            "\`with\` should be followed by the name of a modulation\n> e.g. \`with echo\`";
          const errorFrom = nextValueNode
            ? nextValueNode.from
            : nextNonWhitespacePos;
          const errorTo = nextValueNode
            ? nextValueNode.to
            : nextNonWhitespacePos;
          annotations.push(
            SparkdownAnnotation.mark<Diagnostic>({
              message,
              severity: "error",
            }).range(errorFrom, errorTo),
          );
          return annotations;
        }
      }
      if (text === "ease") {
        const context = getContextNames(nodeRef.node);
        if (
          context.includes("ImageCommand") &&
          nextValueNodeType !== "NameValue"
        ) {
          const message = `\`${text}\` should be followed by the name of an ease\n> e.g. \`ease linear\``;
          const errorFrom = nextValueNode
            ? nextValueNode.from
            : nextNonWhitespacePos;
          const errorTo = nextValueNode
            ? nextValueNode.to
            : nextNonWhitespacePos;
          annotations.push(
            SparkdownAnnotation.mark<Diagnostic>({
              message,
              severity: "error",
            }).range(errorFrom, errorTo),
          );
          return annotations;
        }
      }
      if (text === "to") {
        if (
          nextValueNodeType !== "NumberValue" ||
          (nextValueNodeType === "NumberValue" && Number(nextValueNodeText) < 0)
        ) {
          const message = `\`${text}\` should be followed by a number greater than 0\n> e.g. \`to 0\`, \`to 0.5\`, \`to 1\``;
          const errorFrom = nextValueNode
            ? nextValueNode.from
            : nextNonWhitespacePos;
          const errorTo = nextValueNode
            ? nextValueNode.to
            : nextNonWhitespacePos;
          annotations.push(
            SparkdownAnnotation.mark<Diagnostic>({
              message,
              severity: "error",
            }).range(errorFrom, errorTo),
          );
          return annotations;
        }
      }
      if (
        text === "wait" ||
        text === "loop" ||
        text === "once" ||
        text === "mute" ||
        text === "unmute" ||
        text === "now"
      ) {
        if (
          nextValueNode &&
          (nextValueNodeType === "TimeValue" ||
            nextValueNodeType === "NumberValue")
        ) {
          const message = `\`${text}\` is a flag and cannot take an argument`;
          const nodeCharacterOffset = nextValueNode.to - nodeRef.to;
          annotations.push(
            SparkdownAnnotation.mark<Diagnostic>({
              message,
              severity: "error",
            }).range(nodeRef.from, nodeRef.to + nodeCharacterOffset),
          );
          return annotations;
        }
      }
    }
    return annotations;
  }
}
