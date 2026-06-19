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
const SCREEN_CONTROL_KEYWORDS =
  GRAMMAR_DEFINITION.variables.SCREEN_CONTROL_KEYWORDS || [];
// `[[...]]` brackets carry both visual (show/hide/animate) and screen-lifecycle
// (open/close/navigate) verbs — see SCREEN_CONTROL_KEYWORDS in the grammar.
const BRACKET_CONTROL_KEYWORDS = [
  ...IMAGE_CONTROL_KEYWORDS,
  ...SCREEN_CONTROL_KEYWORDS,
];

// The whole `[[…]]` / `((…))` command + its control token. A clause keyword/
// value is a SIBLING of AssetCommandInstruction (both under the command), so
// reading the control from a clause node walks up to the command, not the
// instruction.
const ASSET_COMMAND = new Set(["ImageCommand", "AudioCommand"]);
const ASSET_COMMAND_CONTROL = new Set(["AssetCommandControl"]);

// Bounded parent walk: nearest ancestor whose name is in `names`, else null.
function ancestorMatching(
  node: { parent?: any } | undefined,
  names: Set<string>,
  max = 10,
): any {
  let cur = node?.parent;
  for (let depth = 0; depth < max && cur; depth++) {
    if (names.has(cur.name)) return cur;
    cur = cur.parent;
  }
  return null;
}

// DFS in-order: first descendant (or self) whose name is in `names`, else null.
function firstDescendant(node: any, names: Set<string>): any {
  if (names.has(node.name)) return node;
  let c = node.firstChild;
  while (c) {
    const found = firstDescendant(c, names);
    if (found) return found;
    c = c.nextSibling;
  }
  return null;
}

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
  /** Does this `[[…]]` command contain a `to <NameValue>` destination (the
   *  navigate target screen)? Mirrors how ReferenceAnnotator reads a clause
   *  value's keyword (`prevSibling.prevSibling`). */
  protected hasNavigateDestination(commandNode: any): boolean {
    const search = (node: any): boolean => {
      if (node.name === "NameValue") {
        const clauseKeywordNode = node.prevSibling?.prevSibling;
        const clauseKeyword = clauseKeywordNode
          ? this.read(clauseKeywordNode.from, clauseKeywordNode.to)
          : "";
        if (clauseKeyword === "to") {
          return true;
        }
      }
      let c = node.firstChild;
      while (c) {
        if (search(c)) {
          return true;
        }
        c = c.nextSibling;
      }
      return false;
    };
    return search(commandNode);
  }

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
      // Report invalid image/screen control
      if (
        context.includes("ImageCommand") &&
        !BRACKET_CONTROL_KEYWORDS.includes(this.read(nodeRef.from, nodeRef.to))
      ) {
        const message = `Unrecognized command: \`[[ ]]\` commands only support ${formatList(
          BRACKET_CONTROL_KEYWORDS,
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
      // `[[navigate <container> to <screen>]]` requires a `to <screen>`
      // destination — a bare `[[navigate <container>]]` is incomplete.
      if (
        context.includes("ImageCommand") &&
        this.read(nodeRef.from, nodeRef.to) === "navigate"
      ) {
        const command = ancestorMatching(nodeRef.node, ASSET_COMMAND);
        if (command && !this.hasNavigateDestination(command)) {
          const message = `Incomplete \`navigate\`: name the destination screen\n> e.g. \`[[navigate menu to settings]]\``;
          annotations.push(
            SparkdownAnnotation.mark<Diagnostic>({
              message,
              severity: "warning",
            }).range(nodeRef.from, nodeRef.to),
          );
          return annotations;
        }
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
        // `[[navigate <container> to <screen>]]` uses `to` to name a destination
        // SCREEN (a NameValue), not a number — skip the numeric check for
        // navigate (the destination is validated as a screen by the reference
        // resolver). Audio `to <number>` (volume target) still validates here.
        const command = ancestorMatching(nodeRef.node, ASSET_COMMAND);
        const controlNode = command
          ? firstDescendant(command, ASSET_COMMAND_CONTROL)
          : null;
        const control = controlNode
          ? this.read(controlNode.from, controlNode.to).trim()
          : "";
        if (
          control !== "navigate" &&
          (nextValueNodeType !== "NumberValue" ||
            (nextValueNodeType === "NumberValue" &&
              Number(nextValueNodeText) < 0))
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
