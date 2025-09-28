import { Range } from "@codemirror/state";
import { getContextNames } from "@impower/textmate-grammar-tree/src/tree/utils/getContextNames";
import GRAMMAR_DEFINITION from "../../../language/sparkdown.language-grammar.json";
import { SparkdownNodeName } from "../../types/SparkdownNodeName";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { formatList } from "../../utils/formatList";
import { SparkdownAnnotation } from "../SparkdownAnnotation";
import { SparkdownAnnotator } from "../SparkdownAnnotator";

const IMAGE_CONTROL_KEYWORDS =
  GRAMMAR_DEFINITION.variables.IMAGE_CONTROL_KEYWORDS;
const AUDIO_CONTROL_KEYWORDS =
  GRAMMAR_DEFINITION.variables.AUDIO_CONTROL_KEYWORDS;
const IMAGE_CLAUSE_KEYWORDS =
  GRAMMAR_DEFINITION.variables.IMAGE_CLAUSE_KEYWORDS;
const AUDIO_CLAUSE_KEYWORDS =
  GRAMMAR_DEFINITION.variables.AUDIO_CLAUSE_KEYWORDS;

const PROPERTY_SELECTOR_SIMPLE_CONDITION_NAMES = [
  "hovered",
  "focused",
  "pressed",
  "disabled",
  "enabled",
  "checked",
  "unchecked",
  "required",
  "valid",
  "invalid",
  "readonly",
  "first",
  "last",
  "only",
  "odd",
  "even",
  "empty",
  "blank",
  "opened",
  "before",
  "after",
  "placeholder",
  "selection",
  "marker",
  "backdrop",
  "initial",
];
const PROPERTY_SELECTOR_FUNCTION_CONDITION_NAMES = [
  "language",
  "direction",
  "has",
  "screen",
  "theme",
];
const PROPERTY_SELECTOR_DIRECTION_ARGUMENTS = ["rtl", "ltr"];
const PROPERTY_SELECTOR_THEME_ARGUMENTS = ["dark", "light"];
const PROPERTY_SELECTOR_SCREEN_ARGUMENTS = [
  "xs",
  "sm",
  "md",
  "lg",
  "xl",
  "2xl",
];

export interface Diagnostic {
  message?: string;
  severity?: "info" | "warning" | "error";
}

export class ValidationAnnotator extends SparkdownAnnotator<
  SparkdownAnnotation<Diagnostic>
> {
  selectorFunctionName = "";

  override begin(): void {
    this.selectorFunctionName = "";
  }

  override enter(
    annotations: Range<SparkdownAnnotation<Diagnostic>>[],
    nodeRef: SparkdownSyntaxNodeRef
  ): Range<SparkdownAnnotation<Diagnostic>>[] {
    if (nodeRef.name === "DefineVariableName") {
      const text = this.read(nodeRef.from, nodeRef.to);
      if (
        IMAGE_CLAUSE_KEYWORDS.includes(text) ||
        AUDIO_CLAUSE_KEYWORDS.includes(text)
      ) {
        const message = `'${text}' is not allowed as a defined name`;
        annotations.push(
          SparkdownAnnotation.mark<Diagnostic>({
            message,
            severity: "error",
          }).range(nodeRef.from, nodeRef.to)
        );
        return annotations;
      }
    }
    // Report invalid property selectors
    if (nodeRef.name === "PropertySelectorSimpleConditionName") {
      const text = this.read(nodeRef.from, nodeRef.to);
      if (!PROPERTY_SELECTOR_SIMPLE_CONDITION_NAMES.includes(text)) {
        const message = PROPERTY_SELECTOR_FUNCTION_CONDITION_NAMES.includes(
          text
        )
          ? "Conditional selector should be a function"
          : "Unrecognized conditional selector";
        annotations.push(
          SparkdownAnnotation.mark<Diagnostic>({ message }).range(
            nodeRef.from,
            nodeRef.to
          )
        );
        return annotations;
      }
    }
    if (nodeRef.name === "PropertySelectorFunctionConditionName") {
      const text = this.read(nodeRef.from, nodeRef.to);
      this.selectorFunctionName = text;
      if (!PROPERTY_SELECTOR_FUNCTION_CONDITION_NAMES.includes(text)) {
        const message = PROPERTY_SELECTOR_SIMPLE_CONDITION_NAMES.includes(text)
          ? "Conditional selector is not a function"
          : "Unrecognized conditional selector";
        annotations.push(
          SparkdownAnnotation.mark<Diagnostic>({ message }).range(
            nodeRef.from,
            nodeRef.to
          )
        );
        return annotations;
      }
    }
    if (nodeRef.name === "PropertySelectorConstant") {
      const text = this.read(nodeRef.from, nodeRef.to);
      if (
        this.selectorFunctionName === "direction" &&
        !PROPERTY_SELECTOR_DIRECTION_ARGUMENTS.includes(text)
      ) {
        const message = `Unrecognized direction argument: Supported values are ${formatList(
          PROPERTY_SELECTOR_DIRECTION_ARGUMENTS
        )}`;
        annotations.push(
          SparkdownAnnotation.mark<Diagnostic>({ message }).range(
            nodeRef.from,
            nodeRef.to
          )
        );
        return annotations;
      }
      if (
        this.selectorFunctionName === "theme" &&
        !PROPERTY_SELECTOR_THEME_ARGUMENTS.includes(text)
      ) {
        const message = `Unrecognized theme argument: Supported values are ${formatList(
          PROPERTY_SELECTOR_THEME_ARGUMENTS
        )}`;
        annotations.push(
          SparkdownAnnotation.mark<Diagnostic>({ message }).range(
            nodeRef.from,
            nodeRef.to
          )
        );
        return annotations;
      }
      if (
        this.selectorFunctionName === "screen" &&
        !PROPERTY_SELECTOR_SCREEN_ARGUMENTS.includes(text)
      ) {
        const message = `Unrecognized screen argument: Supported values are ${formatList(
          PROPERTY_SELECTOR_SCREEN_ARGUMENTS
        )}`;
        annotations.push(
          SparkdownAnnotation.mark<Diagnostic>({ message }).range(
            nodeRef.from,
            nodeRef.to
          )
        );
        return annotations;
      }
    }
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
          IMAGE_CONTROL_KEYWORDS
        )}`;
        annotations.push(
          SparkdownAnnotation.mark<Diagnostic>({ message }).range(
            nodeRef.from,
            nodeRef.to
          )
        );
        return annotations;
      }
      // Report invalid audio control
      if (
        context.includes("AudioCommand") &&
        !AUDIO_CONTROL_KEYWORDS.includes(this.read(nodeRef.from, nodeRef.to))
      ) {
        const message = `Unrecognized audio control: Audio commands only support ${formatList(
          AUDIO_CONTROL_KEYWORDS
        )}`;
        annotations.push(
          SparkdownAnnotation.mark<Diagnostic>({ message }).range(
            nodeRef.from,
            nodeRef.to
          )
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
          }).range(nodeRef.from, nodeRef.to)
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
          }).range(nodeRef.from, nodeRef.to)
        );
        return annotations;
      }
    }
    if (nodeRef.name === "AssetCommandClauseKeyword") {
      const text = this.read(nodeRef.from, nodeRef.to);
      const nextValueNode = nodeRef.node.nextSibling?.node.nextSibling;
      const nextValueNodeType = (
        nextValueNode ? nextValueNode.type.name : ""
      ) as SparkdownNodeName;
      const nextValueNodeText = nextValueNode
        ? this.read(nextValueNode.from, nextValueNode.to)
        : "";
      if (text === "after") {
        if (
          nextValueNodeType !== "ConditionalBracedBlock" &&
          nextValueNodeType !== "TimeValue" &&
          nextValueNodeType !== "NumberValue"
        ) {
          const message = `'${text}' should be followed by a time value (e.g. 'after 2' or 'after 2s' or 'after 200ms')`;
          annotations.push(
            SparkdownAnnotation.mark<Diagnostic>({
              message,
              severity: "error",
            }).range(nodeRef.to, nodeRef.to)
          );
          return annotations;
        }
      }
      if (text === "over") {
        if (
          nextValueNodeType !== "ConditionalBracedBlock" &&
          nextValueNodeType !== "TimeValue" &&
          nextValueNodeType !== "NumberValue"
        ) {
          const message = `'${text}' should be followed by a time value (e.g. 'over 2' or 'over 2s' or 'over 200ms')`;
          annotations.push(
            SparkdownAnnotation.mark<Diagnostic>({
              message,
              severity: "error",
            }).range(nodeRef.to, nodeRef.to)
          );
          return annotations;
        }
      }
      if (text === "with") {
        const context = getContextNames(nodeRef.node);
        if (
          context.includes("ImageCommand") &&
          nextValueNodeType !== "ConditionalBracedBlock" &&
          nextValueNodeType !== "NameValue"
        ) {
          const message = `'${text}' should be followed by the name of a transition or animation (e.g. 'with shake')`;
          annotations.push(
            SparkdownAnnotation.mark<Diagnostic>({
              message,
              severity: "error",
            }).range(nodeRef.to, nodeRef.to)
          );
          return annotations;
        }
        if (
          context.includes("AudioCommand") &&
          nextValueNodeType !== "ConditionalBracedBlock" &&
          nextValueNodeType !== "NameValue"
        ) {
          const message =
            "'with' should be followed by the name of a modulation (e.g. 'with echo')";
          annotations.push(
            SparkdownAnnotation.mark<Diagnostic>({ message }).range(
              nodeRef.from,
              nodeRef.to
            )
          );
          return annotations;
        }
      }
      if (text === "to") {
        if (
          (nextValueNodeType !== "ConditionalBracedBlock" &&
            nextValueNodeType !== "NumberValue") ||
          (nextValueNodeType === "NumberValue" && Number(nextValueNodeText) < 0)
        ) {
          const message = `'${text}' should be followed by a number greater than 0 (e.g. 'to 0' or 'to 0.5' or 'to 1')`;
          annotations.push(
            SparkdownAnnotation.mark<Diagnostic>({
              message,
              severity: "error",
            }).range(nodeRef.to, nodeRef.to)
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
          (nextValueNodeType === "ConditionalBracedBlock" ||
            nextValueNodeType === "TimeValue" ||
            nextValueNodeType === "NumberValue")
        ) {
          const message = `'${text}' is a flag and cannot take an argument`;
          const nodeCharacterOffset = nextValueNode.to - nodeRef.to;
          annotations.push(
            SparkdownAnnotation.mark<Diagnostic>({
              message,
              severity: "error",
            }).range(nodeRef.from, nodeRef.to + nodeCharacterOffset)
          );
          return annotations;
        }
      }
    }
    return annotations;
  }
}
