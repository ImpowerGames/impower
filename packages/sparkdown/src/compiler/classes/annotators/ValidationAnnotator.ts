import { nodeNameSet } from "../../utils/nodeNameSet";
import { Range } from "@codemirror/state";
import { getContextNames } from "@impower/textmate-grammar-tree/src/tree/utils/getContextNames";
import GRAMMAR_DEFINITION from "../../../../language/sparkdown.language-grammar.json";
import VALID_STYLE_PROPS_DATA from "../../constants/validStyleProps.json";
import {
  CUSTOM_PROPERTY_ALIASES,
  isAliasedAttributeProp,
} from "../../constants/dataAttributeProps";
import type { SparkdownNodeName } from "../../types/SparkdownNodeName";
import type { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { formatList } from "../../utils/formatList";
import { SparkdownAnnotation } from "../SparkdownAnnotation";
import { SparkdownAnnotator } from "../SparkdownAnnotator";

const IMAGE_CONTROL_KEYWORDS =
  GRAMMAR_DEFINITION.variables.IMAGE_CONTROL_KEYWORDS || [];
const AUDIO_CONTROL_KEYWORDS =
  GRAMMAR_DEFINITION.variables.AUDIO_CONTROL_KEYWORDS || [];
const LAYOUT_CONTROL_KEYWORDS =
  GRAMMAR_DEFINITION.variables.LAYOUT_CONTROL_KEYWORDS || [];
const LOAD_CONTROL_KEYWORDS =
  GRAMMAR_DEFINITION.variables.LOAD_CONTROL_KEYWORDS || [];
// `[[...]]` brackets carry visual (show/hide/animate), screen-lifecycle
// (open/close/navigate), and preload (load) verbs — see the *_CONTROL_KEYWORDS
// variables in the grammar.
const BRACKET_CONTROL_KEYWORDS = [
  ...IMAGE_CONTROL_KEYWORDS,
  ...LAYOUT_CONTROL_KEYWORDS,
  ...LOAD_CONTROL_KEYWORDS,
];

// The whole `[[…]]` / `((…))` command + its control token. A clause keyword/
// value is a SIBLING of AssetCommandInstruction (both under the command), so
// reading the control from a clause node walks up to the command, not the
// instruction.
const ASSET_COMMAND = nodeNameSet(["ImageCommand", "AudioCommand"]);
const ASSET_COMMAND_CONTROL = nodeNameSet(["AssetCommandControl"]);

// The closed set of `@event` names a Sparkle element line can bind. Source of
// truth: the runtime's `EventMap` (packages/spark-engine/src/game/core/types/
// EventMap.ts) — the renderer only forwards these, and an unknown name silently
// never fires, so a typo (`@clik`) is always a bug. Keep in sync with EventMap.
const VALID_SPARKLE_EVENTS = new Set([
  "click", "mousedown", "mouseenter", "mouseleave", "mousemove", "mouseout",
  "mouseover", "mouseup",
  "pointercancel", "pointerdown", "pointerenter", "pointerleave", "pointermove",
  "pointerout", "pointerover", "pointerup", "gotpointercapture",
  "lostpointercapture",
  "touchcancel", "touchend", "touchmove", "touchstart",
  "drag", "dragend", "dragenter", "dragleave", "dragover", "dragstart", "drop",
  "wheel",
  "scroll", "scrollend",
  "input", "change",
  "keydown", "keyup", "keypress",
  "focus", "focusin", "focusout", "blur",
]);

// The prop names a Sparkle `#prop=value` may use without warning: every real CSS
// property + the sparkle style vocabulary + widget props (generated into
// validStyleProps.json from mdn-data + sparkle-style-transformer). Sparkle passes
// unknown props straight through to CSS, so the value is catching typos
// (`#colr`) without flagging valid raw CSS or `--custom` props.
const VALID_STYLE_PROPS = new Set<string>(VALID_STYLE_PROPS_DATA.props);

// The element-line handler attribute (`@click=save`). `EventAttributeName` is
// also emitted for STYLE SELECTORS (`@hovered:`, `@theme(dark)`), whose
// vocabulary is unrelated — so the EventMap check must find this wrapper above
// it before it says anything.
const SPARKLE_EVENT_HANDLER = nodeNameSet(["LuauEventAttribute"]);

// Luau string literals. Every form parses as `<name>_begin`, `<name>_content`
// and `<name>_end`; an unfinished literal has no `_end` child.
const LUAU_QUOTED_STRING = nodeNameSet([
  "LuauDoubleQuotedString",
  "LuauSingleQuotedString",
  "LuauInterpolatedString",
]);
const LUAU_STRING = nodeNameSet([
  "LuauDoubleQuotedString",
  "LuauSingleQuotedString",
  "LuauInterpolatedString",
  "LuauMultilineString",
]);

// Luau numeric literals. Their first child is the literal text; the second is
// the trailing whitespace capture.
const LUAU_NUMBER = nodeNameSet([
  "LuauNumericDecimal",
  "LuauNumericHex",
  "LuauNumericBinary",
]);

const MALFORMED_STRING = "Malformed string; did you forget to finish it?";
const MALFORMED_NUMBER = "Malformed number";
// Luau reports an unfinished `--[[` from wherever the parser was expecting
// its next token; the expression-position wording is the one its test suite
// pins, so it is the one sparkdown uses everywhere.
const UNFINISHED_COMMENT =
  "Expected identifier when parsing expression, got unfinished comment";

// Luau's `toUtf8` refuses code points above this, so `\u{80000000}` is a
// malformed escape rather than a character.
const MAX_UNICODE_ESCAPE = 0x7fffffff;

function childNamed(node: any, name: string): any {
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.name === name) return c;
  }
  return null;
}

// Normalize a prop name to the vocabulary's kebab-case form the way the renderer
// does (`getCSSPropertyName`): camelCase → kebab, `_` → `-`, lowercased. So
// `#maxWidth` / `#max_width` both match `max-width`.
function normalizeStylePropName(name: string): string {
  return name
    .replace(/_/g, "-")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase();
}

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

  protected error(
    annotations: Range<SparkdownAnnotation<Diagnostic>>[],
    message: string,
    from: number,
    to: number,
  ) {
    annotations.push(
      SparkdownAnnotation.mark<Diagnostic>({ message, severity: "error" }).range(
        from,
        to,
      ),
    );
  }

  /**
   * Malformed Luau literals: an unfinished string or block comment, a bad
   * escape sequence, or a number that runs into letters. The grammar
   * recovers from each of these silently (an unfinished `"` swallows the
   * following lines, `123x` parses as `123` followed by narrative text, `\xQQ`
   * lowers to a literal `x`), so without these diagnostics the mistake shows
   * up as wrong program behavior rather than an error at the typo. The
   * wording matches Luau's parser so its diagnostic tests apply verbatim.
   */
  protected validateLuauLiteral(
    annotations: Range<SparkdownAnnotation<Diagnostic>>[],
    nodeRef: SparkdownSyntaxNodeRef,
  ): boolean {
    const name = nodeRef.name as string;
    if (LUAU_STRING.has(name)) {
      const node = nodeRef.node as any;
      // `[[...]]` holds raw text: no escapes, and newlines are content.
      if (!LUAU_QUOTED_STRING.has(name)) {
        if (!childNamed(node, `${name}_end`)) {
          this.error(annotations, MALFORMED_STRING, nodeRef.from, nodeRef.to);
          return true;
        }
        return false;
      }
      const escapeMessage =
        name === "LuauInterpolatedString"
          ? "Interpolated string literal contains malformed escape sequence"
          : "String literal contains malformed escape sequence";
      const content = childNamed(node, `${name}_content`);
      let prev: any = null;
      for (let c = content?.firstChild; c; prev = c, c = c.nextSibling) {
        // A quoted string ends at its line unless the newline is escaped
        // (`\` + newline, or `\z` which skips the following whitespace).
        if (c.name === "Newline") {
          const escaped =
            prev &&
            (prev.name === "LuauEscapeLine" ||
              (prev.name === "LuauEscapeStandard" &&
                this.read(prev.from, prev.to) === "\\z"));
          if (!escaped) {
            this.error(annotations, MALFORMED_STRING, nodeRef.from, c.from);
            return true;
          }
          continue;
        }
        let malformed = false;
        if (c.name === "LuauEscapeAny") {
          // `\x` and `\u` only reach here when their digits are missing.
          const esc = this.read(c.from, c.to);
          malformed = esc === "\\x" || esc === "\\u";
        } else if (c.name === "LuauEscapeDecimal") {
          malformed = parseInt(this.read(c.from + 1, c.to), 10) > 255;
        } else if (c.name === "LuauEscapeUnicode") {
          const hex = this.read(c.from + 3, c.to - 1);
          malformed = hex.length === 0 || parseInt(hex, 16) > MAX_UNICODE_ESCAPE;
        }
        if (malformed) {
          this.error(annotations, escapeMessage, c.from, c.to);
          return true;
        }
      }
      // No newline and no closing quote: the string runs to the end of the
      // file (a quoted string is always the last thing on its line, so the
      // newline check above reports every other unfinished one).
      if (!childNamed(node, `${name}_end`)) {
        this.error(annotations, MALFORMED_STRING, nodeRef.from, nodeRef.to);
        return true;
      }
      return false;
    }
    if (LUAU_NUMBER.has(name)) {
      // `((text ...))` reuses the number rule for its control argument, where
      // the surrounding syntax is not Luau.
      if (getContextNames(nodeRef.node).includes("TextCommandControl")) {
        return false;
      }
      const literal = (nodeRef.node as any).firstChild;
      const literalTo = literal ? literal.to : nodeRef.to;
      const text = this.read(nodeRef.from, literalTo);
      // Luau's lexer takes every following letter, digit, `_` and `.` into
      // the number token and then fails to convert it; the grammar stops at
      // the first character it cannot use, so look at what comes next.
      const rest = this.read(literalTo, literalTo + 64).match(/^[A-Za-z0-9_.]+/);
      const noDigits = /^0_*[xX]_*$/.test(text);
      if (rest || noDigits) {
        this.error(
          annotations,
          MALFORMED_NUMBER,
          nodeRef.from,
          literalTo + (rest ? rest[0].length : 0),
        );
        return true;
      }
      return false;
    }
    if (name === "LuauBlockComment") {
      if (!childNamed(nodeRef.node, "LuauBlockComment_end")) {
        this.error(annotations, UNFINISHED_COMMENT, nodeRef.from, nodeRef.to);
        return true;
      }
      return false;
    }
    return false;
  }

  override enter(
    annotations: Range<SparkdownAnnotation<Diagnostic>>[],
    nodeRef: SparkdownSyntaxNodeRef,
  ): Range<SparkdownAnnotation<Diagnostic>>[] {
    if (this.validateLuauLiteral(annotations, nodeRef)) {
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
    // Dot-prefixed classes on a Sparkle element line (`row.hud`, `text.title`).
    // Classes are SPACE-separated bare words after the tag (`row hud`), so a `.`
    // breaks the header parse into `<tag>` + an `ERROR_UNRECOGNIZED` remainder
    // starting with `.`. Surface a friendly warning pointing at the fix rather
    // than leaving the class silently dropped. Gated on the Sparkle element
    // context (a struct body line) + the leading dot so other unrecognized
    // spans aren't mislabeled.
    if (nodeRef.name === "ERROR_UNRECOGNIZED") {
      // A dotted class breaks the header at the `.`, which becomes a lone
      // ERROR_UNRECOGNIZED node (text `"."`). Warn only for that dot inside a
      // Sparkle element line so unrelated unrecognized spans aren't mislabeled.
      const text = this.read(nodeRef.from, nodeRef.to).trim();
      const context = getContextNames(nodeRef.node);
      // A CSS-nesting SELECTOR is not a dotted class. `&.secondary:` compiles
      // to a real, populated compound rule — `builtins.sd` uses the idiom 13
      // times — and taking the suggested fix turns it into a descendant TYPE
      // selector matching nothing, with no further warning. So the advice was
      // not merely noise: following it silently broke working styles.
      //
      // Detected on the text preceding the dot on this line: a selector
      // combinator (`&`, `>`, `*`) means we are in selector position, where
      // dots are the correct syntax.
      const lineStart = this.read(
        Math.max(0, nodeRef.from - 200),
        nodeRef.from,
      );
      const beforeDot = lineStart.slice(lineStart.lastIndexOf("\n") + 1);
      const inSelectorPosition = /[&>*]/.test(beforeDot);
      if (
        text.startsWith(".") &&
        context.includes("LuauStructBodyLine") &&
        !inSelectorPosition &&
        // Only element-line headers — not a stray `.` inside a `key = value`
        // style property, where the fix isn't "use a space".
        !context.includes("LuauStructScalarProperty")
      ) {
        const message = `Classes are space-separated, not dot-prefixed — replace the \`.\` with a space\n> e.g. \`row hud\`, not \`row.hud\``;
        annotations.push(
          SparkdownAnnotation.mark<Diagnostic>({
            message,
            severity: "warning",
          }).range(nodeRef.from, nodeRef.to),
        );
        return annotations;
      }
    }
    // Unrecognized `@event` name on a Sparkle element line (`@clik=save`). The
    // event set is closed (EventMap) and an unknown name silently never fires,
    // so surface a typo instead of leaving a dead handler. `EventAttributeName`
    // captures exactly the identifier after `@` (no `@`, no whitespace).
    //
    // Gated on the enclosing HANDLER attribute, because the grammar emits this
    // same leaf for a style SELECTOR (`@hovered:`, `@focused`, `@theme(dark)`,
    // `@has(button)`) — a closed vocabulary of its own that has nothing to do
    // with EventMap. Ungated, every one of those warned that a selector the
    // docs recommend and `builtins.sd` uses 90 times "never fires", and
    // suggested `@click`/`@input` in its place.
    if (
      nodeRef.name === "EventAttributeName" &&
      ancestorMatching(nodeRef.node, SPARKLE_EVENT_HANDLER)
    ) {
      const name = this.read(nodeRef.from, nodeRef.to).trim();
      if (name && !VALID_SPARKLE_EVENTS.has(name)) {
        const message = `Unrecognized event \`@${name}\` — Sparkle dispatches a fixed set of events, so this handler never fires\n> e.g. \`@click\`, \`@input\`, \`@change\`, \`@keydown\``;
        annotations.push(
          SparkdownAnnotation.mark<Diagnostic>({
            message,
            severity: "warning",
          }).range(nodeRef.from, nodeRef.to),
        );
        return annotations;
      }
    }
    // Unterminated `{` inside an interpolated string.
    //
    // Matches Luau, which lexes a `{` that reaches the end of its string as a
    // BrokenString and reports "Malformed interpolated string; did you forget
    // to add a '}'?". Without this the mistake is silent: the interpolation
    // closes at the string boundary and its contents quietly vanish from the
    // value (and, before the string-bounded rules, it swallowed the rest of
    // the file).
    //
    // Detected on the text rather than on an `_end` child: closing at the
    // string boundary still produces an `_end` node, just a zero-width one.
    if (
      nodeRef.name === "LuauInterpolatedStringExpression" ||
      nodeRef.name === "LuauDoubleQuotedStringInterpolation" ||
      nodeRef.name === "LuauBacktickStringInterpolation" ||
      nodeRef.name === "LuauFunctionCallShorthand" ||
      nodeRef.name === "LuauDoubleQuotedFunctionCallShorthand" ||
      nodeRef.name === "LuauBacktickFunctionCallShorthand"
    ) {
      const raw = this.read(nodeRef.from, nodeRef.to);
      // Empty `{}` — Luau: "Malformed interpolated string, expected expression
      // inside '{}'". It used to lower to nothing and silently DELETE itself
      // from the string, so `` `a={}; x=3` `` became `a=; x=3`. Use `'...'`
      // or `[[...]]` for a string that should hold literal braces.
      if (/^\{\s*\}$/.test(raw.trim())) {
        annotations.push(
          SparkdownAnnotation.mark<Diagnostic>({
            message:
              "Malformed interpolated string, expected expression inside `{}`",
            severity: "error",
          }).range(nodeRef.from, nodeRef.to),
        );
        return annotations;
      }
      const closed = raw.trimEnd().endsWith("}");
      if (!closed) {
        annotations.push(
          SparkdownAnnotation.mark<Diagnostic>({
            message:
              "Malformed interpolated string; did you forget to add a `}`?",
            severity: "error",
          }).range(nodeRef.from, nodeRef.to),
        );
        return annotations;
      }
    }
    // Unrecognized inline RICH TEXT tag inside a content string
    // (`text "a <bold>x</bold>"`). The runtime leaves an unknown tag as literal
    // characters — deliberately, so prose like `5 < 6` survives — which means a
    // typo shows up verbatim in the UI instead of styling anything. The grammar
    // already separates a tag-SHAPED token whose name isn't in the vocabulary
    // (`SparkleRichTextTagUnknown`) from a recognized one, so this only has to
    // report it.
    //
    // NOT flagged inside a `#prop` value: rich text is only parsed in element
    // CONTENT, so `<b>` in a placeholder is inert rather than misspelled.
    if (nodeRef.name === "SparkleRichTextTagUnknown") {
      const raw = this.read(nodeRef.from, nodeRef.to).trim();
      const name = raw.replace(/^<\/?/, "").replace(/[=>].*$/s, "");
      const inPropValue = getContextNames(nodeRef.node).includes(
        "LuauPropAttribute",
      );
      if (name && !inPropValue) {
        const message = `Unrecognized rich text tag \`<${name}>\` — not a known inline tag, so it renders literally instead of styling anything\n> Styling tags are \`<b>\`, \`<i>\`, \`<u>\`, \`<s>\`, \`<sub>\`, \`<sup>\`, \`<mark=…>\`, \`<color=…>\`, \`<size=…>\`; wrap text in \`<noparse>…</noparse>\` to keep angle brackets literal`;
        annotations.push(
          SparkdownAnnotation.mark<Diagnostic>({
            message,
            severity: "warning",
          }).range(nodeRef.from, nodeRef.to),
        );
        return annotations;
      }
    }
    // Unrecognized inline `#prop` name on a Sparkle element line (`#colr=red`).
    // Sparkle passes unknown props straight through to CSS, so a typo silently
    // does nothing — warn when the name is neither a known style prop / CSS
    // property / widget prop nor a `--custom` property. `StyleAttributeName`
    // captures exactly the identifier after `#`.
    if (nodeRef.name === "StyleAttributeName") {
      const raw = this.read(nodeRef.from, nodeRef.to).trim();
      const name = raw.replace(/^#/, "");
      // `--custom` CSS variables and `data-*` / `aria-*` attributes are always
      // valid on any element, so they're never flagged. So are the named
      // non-standard props (`#tooltip`), which the ui writes out as `data-*`.
      const isPassThrough =
        name.startsWith("--") ||
        name.startsWith("data-") ||
        name.startsWith("aria-") ||
        isAliasedAttributeProp(name) ||
        CUSTOM_PROPERTY_ALIASES.has(normalizeStylePropName(name));
      if (
        name &&
        !isPassThrough &&
        !VALID_STYLE_PROPS.has(name) &&
        !VALID_STYLE_PROPS.has(normalizeStylePropName(name))
      ) {
        const message = `Unrecognized prop \`#${name}\` — not a known style property, so it has no effect\n> Sparkle props are CSS-style names (\`background-color\`, \`gap\`, \`padding\`) or short aliases; use \`#--${name}\` for a custom CSS variable`;
        annotations.push(
          SparkdownAnnotation.mark<Diagnostic>({
            message,
            severity: "warning",
          }).range(nodeRef.from, nodeRef.to),
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
