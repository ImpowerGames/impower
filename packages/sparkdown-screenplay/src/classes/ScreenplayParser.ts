import { type SyntaxNode, Tree } from "@lezer/common";
import GRAMMAR_DEFINITION from "../../../sparkdown/language/sparkdown.language-grammar.json";
import type { SparkdownNodeName } from "../../../sparkdown/src/compiler/types/SparkdownNodeName";
import { readSkipping } from "../../../sparkdown/src/compiler/utils/readSkipping";
import { isStyleCode, trimStyled, trimStyledBounds } from "../../../sparkdown/src/runtime/displayStyle";
import { TextmateGrammarParser } from "../../../textmate-grammar-tree/src/tree/classes/TextmateGrammarParser";
import { ScreenplayToken } from "../types/ScreenplayToken";
import { MetadataTokenType } from "../types/ScreenplayTokenType";
import { GLUED_ALTERNATOR_BLOCKS, gluedAlternatorJoin } from "../utils/gluedAlternatorLayout";
import { insertedAt, UNPLACED } from "../utils/printedPosition";
import { printsAsBlankLine } from "../utils/printsAsBlankLine";
import { readStyled } from "../utils/readStyled";
import { isRootFunctionName } from "../utils/rootFunctionName";

const COMPILER_FIELDS = new Set(["typecheck"]);

const SAME_LINE_TEXT_SEPARATORS = new Set([
  "SparkdownBlockComment",
  "SparkdownBlockCommentOnLine",
]);

const TEXT_UNPRINTED = new Set(["Glue", "SparkdownBlockComment", "Divert"]);

const CHOICE_UNPRINTED = new Set(["SparkdownBlockComment", "SparkdownInlineComment", "Divert", "Tags", "Tag"]);

const ARM_UNPRINTED = new Set(["ArmTag", "ArmDivert", "ArmTunnel", "ArmUnknown", "SparkdownBlockComment"]);

const TOKENS_ON_LEAVE = new Set(["DialogueCharacter", "Choice"]);

const GLUED_ARM = "LuauSparkdownInlineGluedAlternatorArm";

interface JoinedPositions {
  readonly parts: readonly Positions[];
  readonly length: number;
}

type Positions = readonly number[] | JoinedPositions;

interface Reading {
  text: string;
  styled: string;
  at?: Positions;
}

const NO_TEXT: Reading = { text: "", styled: "" };

const NEWLINE: Reading = { text: "\n", styled: "\n" };

const isFlat = (positions: Positions): positions is readonly number[] => Array.isArray(positions);

const flatten = (positions: Positions): number[] => {
  const flat: number[] = [];
  const pending: Positions[] = [positions];
  while (pending.length > 0) {
    const next = pending.pop()!;
    if (isFlat(next)) {
      for (const position of next) flat.push(position);
    } else {
      for (let index = next.parts.length - 1; index >= 0; index--) pending.push(next.parts[index]!);
    }
  }
  return flat;
};

const withoutLast = (positions: Positions): Positions => {
  if (isFlat(positions)) return positions.slice(0, -1);
  const parts = positions.parts.filter((part) => part.length > 0);
  const last = parts.pop();
  if (!last) return [];
  return { parts: [...parts, withoutLast(last)], length: positions.length - 1 };
};

const placedOf = (reading: { styled: string; at?: Positions }): Positions =>
  reading.at ?? new Array<number>(reading.styled.length).fill(UNPLACED);

const join = (...parts: Reading[]): Reading => {
  const text = parts.map((part) => part.text).join("");
  const styled = parts.map((part) => part.styled).join("");
  return parts.some((part) => part.at)
    ? { text, styled, at: { parts: parts.map(placedOf), length: styled.length } }
    : { text, styled };
};

const flatReading = <T extends { at?: Positions }>(reading: T): Omit<T, "at"> & { at?: number[] } =>
  reading.at ? { ...reading, at: flatten(reading.at) } : (reading as Omit<T, "at">);

const plain = (text: string): Reading => ({ text, styled: text });

const trimReading = (
  reading: { styled: string; at?: Positions },
  options: { start?: boolean; end?: boolean } = {},
): { styled: string; at?: number[] } => {
  const styled = trimStyled(reading.styled, options);
  if (!reading.at) return { styled };
  const placed = flatten(reading.at);
  const written = reading.styled;
  const { from, to } = trimStyledBounds(written, options);
  const at: number[] = [];
  for (let index = 0; index < from; index++) if (isStyleCode(written[index]!)) at.push(placed[index]!);
  for (let index = from; index < to; index++) at.push(placed[index]!);
  for (let index = to; index < written.length; index++) if (isStyleCode(written[index]!)) at.push(placed[index]!);
  return { styled, at };
};

const isTextUnprinted = (child: SyntaxNode) => TEXT_UNPRINTED.has(child.name);

const isArmUnprinted = (child: SyntaxNode) => ARM_UNPRINTED.has(child.name);

const isChoiceUnprinted = (child: SyntaxNode) =>
  CHOICE_UNPRINTED.has(child.name) || GLUED_ALTERNATOR_BLOCKS.has(child.name);

const trimRanges = (ranges: number[], leading: number, trailing: number): number[] => {
  const trimmed = [...ranges];
  let skip = leading;
  while (skip > 0 && trimmed.length > 0) {
    const width = trimmed[1]! - trimmed[0]!;
    if (width > skip) {
      trimmed[0]! += skip;
      skip = 0;
    } else {
      trimmed.splice(0, 2);
      skip -= width;
    }
  }
  skip = trailing;
  while (skip > 0 && trimmed.length > 0) {
    const width = trimmed.at(-1)! - trimmed.at(-2)!;
    if (width > skip) {
      trimmed[trimmed.length - 1]! -= skip;
      skip = 0;
    } else {
      trimmed.splice(-2, 2);
      skip -= width;
    }
  }
  return trimmed;
};

export const screenplayTokens = (tree: Tree, script: string, positions = false): ScreenplayToken[] => {
    const stack: SparkdownNodeName[] = [];
    const tokens: ScreenplayToken[] = [{ tag: "page_break" }];
    let frontMatterKey = "";
    let frontMatterValue = NO_TEXT;
    let frontMatterSource: number[] = [];
    let title = NO_TEXT;
    let heading = NO_TEXT;
    let transitional = NO_TEXT;
    let action = NO_TEXT;
    let choice = NO_TEXT;
    let choice_prefix = "";
    let choicePrefixAt: number[] = [];
    let choice_suffix = "";
    let character = NO_TEXT;
    let position: "l" | "r" | undefined = undefined;
    let textSource: number[] = [];
    let characterSource: number[] = [];
    let choiceSource: number[] = [];
    let lineStart = 0;
    const read = (from: number, to: number) => script.slice(from, to);
    let sink: number[] = [];
    const readIntoSink = (from: number, to: number) => {
      if (to > from) sink.push(from, to);
      return read(from, to);
    };
    const readInto = (source: number[]) => {
      sink = source;
      return readIntoSink;
    };
    let leading = false;
    const readWords = (node: SyntaxNode, source: number[]): Reading => {
      const text = readSkipping(node, readInto(source), isTextUnprinted);
      const styled = readStyled(node, read, isTextUnprinted, undefined, positions);
      if (leading) {
        leading = false;
        return { text: text.trimStart(), ...trimReading(styled, { end: false }) };
      }
      return { text, ...styled };
    };
    const readLine = (node: SyntaxNode, source?: number[]): Reading => {
      if (source && node.to > node.from) source.push(node.from, node.to);
      return { text: read(node.from, node.to), ...readStyled(node, read, undefined, undefined, positions) };
    };

    const textBefore = (node: SyntaxNode) => {
      let before = node.prevSibling;
      while (before && SAME_LINE_TEXT_SEPARATORS.has(before.name)) {
        before = before.prevSibling;
      }
      return before;
    };
    const continuesAfterComment = (node: SyntaxNode): boolean => {
      const before = textBefore(node);
      if (before && GLUED_ALTERNATOR_BLOCKS.has(before.name)) return true;
      return before !== node.prevSibling && before?.name === "TextChunk";
    };
    const continuesBeforeGlued = (node: SyntaxNode): boolean => {
      const before = textBefore(node);
      return before?.name === "TextChunk" || (!!before && GLUED_ALTERNATOR_BLOCKS.has(before.name));
    };
    const withoutEndNewline = (lines: Reading): Reading => {
      const text = lines.text.replace(/\n$/, "");
      const styled = lines.styled.replace(/\n$/, "");
      if (!lines.at) return { text, styled };
      return { text, styled, at: styled.length < lines.styled.length ? withoutLast(lines.at) : lines.at };
    };
    const appendLine = (lines: Reading, node: SyntaxNode, line: Reading): Reading =>
      continuesAfterComment(node)
        ? join(withoutEndNewline(lines), line, NEWLINE)
        : join(lines, line, NEWLINE);
    const appendGlued = (lines: Reading, node: SyntaxNode, glued: Reading): Reading =>
      continuesBeforeGlued(node)
        ? join(withoutEndNewline(lines), glued, NEWLINE)
        : join(lines, { text: glued.text.trimStart(), ...trimReading(glued, { end: false }) }, NEWLINE);
    const readArm = (arm: SyntaxNode, source: number[]): { reading: Reading; ranges: number[] } | undefined => {
      const outer = sink;
      const ranges: number[] = [];
      const raw = readSkipping(arm, readInto(ranges), isArmUnprinted);
      sink = outer;
      const text = raw.trim();
      if (!text) return undefined;
      const trimmed = trimRanges(ranges, raw.length - raw.trimStart().length, raw.length - raw.trimEnd().length);
      source.push(...trimmed);
      return {
        reading: { text, ...trimReading(readStyled(arm, read, isArmUnprinted, undefined, positions)) },
        ranges: trimmed,
      };
    };
    const inserted = (text: string, anchor: number): Reading =>
      positions ? { text, styled: text, at: new Array<number>(text.length).fill(insertedAt(anchor)) } : plain(text);
    const readGlued = (block: SyntaxNode, source: number[]): Reading => {
      const arms: { reading: Reading; ranges: number[] }[] = [];
      const cursor = block.cursor();
      while (cursor.next() && cursor.from < block.to) {
        if (cursor.name !== GLUED_ARM) continue;
        const arm = readArm(cursor.node, source);
        if (arm) arms.push(arm);
      }
      if (arms.length === 0) return NO_TEXT;
      const parts: Reading[] = [inserted(gluedAlternatorJoin("before"), arms[0]!.ranges[0]!)];
      arms.forEach((arm, index) => {
        if (index > 0) parts.push(inserted(gluedAlternatorJoin("between"), arm.ranges[0]!));
        parts.push(arm.reading);
      });
      const after = gluedAlternatorJoin("after");
      if (after) parts.push(inserted(after, arms.at(-1)!.ranges.at(-1)!));
      return join(...parts);
    };
    const readChoiceText = (node: SyntaxNode): Reading => {
      const glued = new Map<number, Reading>();
      const gluedReading = (child: SyntaxNode) => {
        if (!GLUED_ALTERNATOR_BLOCKS.has(child.name)) return undefined;
        let reading = glued.get(child.from);
        if (!reading) {
          reading = readGlued(child, choiceSource);
          glued.set(child.from, reading);
        }
        return reading;
      };
      const text = readSkipping(node, readInto(choiceSource), isChoiceUnprinted, (child) => gluedReading(child)?.text ?? "");
      const styled = readStyled(node, read, isChoiceUnprinted, (child) => {
        const reading = gluedReading(child);
        return reading && flatReading(reading);
      }, positions);
      return { text, ...styled };
    };

    const appendReading = (token: ScreenplayToken, reading: Reading) => {
      const before = token.styled ?? "";
      token.text = `${token.text ?? ""}${reading.text}`;
      token.styled = `${before}${reading.styled}`;
      if (token.at || reading.at) {
        const at = token.at ?? new Array<number>(before.length).fill(UNPLACED);
        for (const position of flatten(placedOf(reading))) at.push(position);
        token.at = at;
      }
    };

    let headingContinues = false;
    const flushText = () => {
      const source = textSource;
      textSource = [];
      if (title.text) {
        tokens.push({ tag: "title", ...flatReading(title), source });
        title = NO_TEXT;
      }
      if (heading.text) {
        tokens.push(
          headingContinues
            ? { tag: "heading", ...flatReading(heading), continued: true, source }
            : { tag: "heading", ...flatReading(heading), source },
        );
        heading = NO_TEXT;
        headingContinues = true;
      }
      if (transitional.text) {
        tokens.push({ tag: "transitional", ...flatReading(transitional), source });
        transitional = NO_TEXT;
      }
      if (action.text) {
        tokens.push({ tag: "action", ...flatReading(action), source });
        action = NO_TEXT;
      }
    };

    let pendingTokens = 0;
    let heldSeparator: number | undefined = undefined;
    const addSeparator = (from: number) => {
      if (pendingTokens > 0) {
        heldSeparator ??= from;
        return;
      }
      flushText();
      if (tokens.at(-1)?.tag !== "separator") {
        tokens.push({ tag: "separator", from });
      }
    };

    const isWhitespaceOnly = (start: number, end: number): boolean => {
      for (let i = start; i < end; i++) {
        const c = script.charCodeAt(i);
        if (c !== 0x20 && c !== 0x09) return false;
      }
      return true;
    };

    tree.iterate({
      enter: (nodeRef) => {
        const name = nodeRef.name as SparkdownNodeName;
        const from = nodeRef.from;
        const to = nodeRef.to;

        if (printsAsBlankLine(name, nodeRef.node.parent?.name)) {
          addSeparator(from);
        }
        if (TOKENS_ON_LEAVE.has(name)) {
          pendingTokens++;
        }
        if (name === "SparkdownBlockComment") {
          return false;
        }
        if (name === "Newline") {
          if (isWhitespaceOnly(lineStart, from)) {
            addSeparator(lineStart);
          }
          lineStart = to;
          leading = false;
        }
        if (name === "LeadingGlue") {
          leading = true;
        }

        if (name === "FrontMatterFieldKeyword") {
          const text = read(from, to);
          frontMatterKey = text;
          frontMatterValue = NO_TEXT;
          frontMatterSource = [];
        }
        if (name === "FrontMatterString") {
          frontMatterValue = join(frontMatterValue, readLine(nodeRef.node, frontMatterSource));
        }

        if (name === "Scene") {
          tokens.push({ tag: "page_break" });
        }
        if (name === "SceneDeclarationName") {
          const text = read(from, to);
          tokens.push({ tag: "scene", text });
        }

        if (name === "LuauSparkdownAlternatorArm") {
          flushText();
          const arm = readArm(nodeRef.node, textSource);
          if (arm) {
            action = join(arm.reading, NEWLINE);
            flushText();
          } else {
            textSource = [];
          }
          return false;
        }

        if (GLUED_ALTERNATOR_BLOCKS.has(name) && !stack.includes("Choice")) {
          if (stack.includes("BlockDialogue_content") || stack.includes("InlineDialogue_content")) {
            const last = tokens.at(-1);
            if (continuesBeforeGlued(nodeRef.node) && last?.tag === "dialogue_content") {
              appendReading(last, readGlued(nodeRef.node, (last.source ??= [])));
            } else {
              const source: number[] = [];
              const glued = readGlued(nodeRef.node, source);
              if (glued.text) {
                tokens.push({
                  tag: "dialogue_content",
                  text: glued.text.trimStart(),
                  ...trimReading(glued, { end: false }),
                  position,
                  source,
                });
              }
            }
          } else {
            const glued = readGlued(nodeRef.node, textSource);
            if (glued.text) {
              if (stack.includes("BlockTitle") || stack.includes("InlineTitle")) {
                title = appendGlued(title, nodeRef.node, glued);
              } else if (stack.includes("BlockHeading") || stack.includes("InlineHeading")) {
                heading = appendGlued(heading, nodeRef.node, glued);
              } else if (stack.includes("BlockTransitional") || stack.includes("InlineTransitional")) {
                transitional = appendGlued(transitional, nodeRef.node, glued);
              } else {
                action = appendGlued(action, nodeRef.node, glued);
              }
            }
          }
          return false;
        }

        if (name === "BranchDeclarationName") {
          const text = read(from, to);
          tokens.push({ tag: "branch", text });
        }

        if (
          name === "LuauFunctionDeclarationName" &&
          isRootFunctionName(nodeRef.node, read)
        ) {
          const text = read(from, to);
          tokens.push({ tag: "function", text });
        }

        if (stack.includes("BlockTitle") || stack.includes("InlineTitle")) {
          if (name === "TextChunk") {
            title = appendLine(title, nodeRef.node, readWords(nodeRef.node, textSource));
          }
          if (name === "ParentheticalLineContent") {
            title = join(title, readLine(nodeRef.node, textSource), NEWLINE);
          }
        }

        if (stack.includes("BlockHeading") || stack.includes("InlineHeading")) {
          if (name === "TextChunk") {
            heading = appendLine(heading, nodeRef.node, readWords(nodeRef.node, textSource));
          }
          if (name === "ParentheticalLineContent") {
            heading = join(heading, readLine(nodeRef.node, textSource), NEWLINE);
          }
        }

        if (
          stack.includes("BlockTransitional") ||
          stack.includes("InlineTransitional")
        ) {
          if (name === "TextChunk") {
            transitional = appendLine(
              transitional,
              nodeRef.node,
              readWords(nodeRef.node, textSource),
            );
          }
          if (name === "ParentheticalLineContent") {
            transitional = join(transitional, readLine(nodeRef.node, textSource), NEWLINE);
          }
        }

        if (
          stack.includes("BlockAction") ||
          stack.includes("InlineAction") ||
          stack.includes("ImplicitAction")
        ) {
          if (name === "TextChunk") {
            action = appendLine(action, nodeRef.node, readWords(nodeRef.node, textSource));
          }
          if (name === "ParentheticalLineContent") {
            action = join(action, readLine(nodeRef.node, textSource), NEWLINE);
          }
        }

        if (name === "DialogueCharacterName") {
          characterSource = [];
          character = readLine(nodeRef.node, characterSource);
        }
        if (name === "DialogueCharacterParenthetical") {
          character = join(character, readLine(nodeRef.node, characterSource));
        }
        if (name === "DialogueCharacterPositionContent") {
          const text = read(from, to);
          if (text === "<" || text === "left" || text === "l") {
            position = "l";
          } else if (text === ">" || text === "right" || text === "r") {
            position = "r";
          }
        }
        if (
          stack.includes("BlockDialogue_content") ||
          stack.includes("InlineDialogue_content")
        ) {
          if (name === "TextChunk") {
            const continues = continuesAfterComment(nodeRef.node);
            const last = tokens.at(-1);
            if (continues && last?.tag === "dialogue_content") {
              appendReading(last, readWords(nodeRef.node, (last.source ??= [])));
            } else {
              const source: number[] = [];
              tokens.push({
                tag: "dialogue_content",
                ...flatReading(readWords(nodeRef.node, source)),
                position,
                source,
              });
            }
          }
          if (name === "ParentheticalLineContent") {
            const source: number[] = [];
            tokens.push({
              tag: "dialogue_parenthetical",
              ...flatReading(readLine(nodeRef.node, source)),
              position,
              source,
            });
          }
        }

        if (stack.includes("Choice")) {
          if (name === "ChoiceMark") {
            const text = read(from, to);
            choice_prefix += text;
            choiceSource.push(from, to);
            for (let index = from; index < to; index++) choicePrefixAt.push(index);
          }
          if (name === "Choice_content") {
            choice = join(choice, readChoiceText(nodeRef.node));
          }
        }

        stack.push(name);
        return undefined;
      },
      leave: (nodeRef) => {
        const name = nodeRef.name as SparkdownNodeName;
        if (name === "FrontMatterField" && !COMPILER_FIELDS.has(frontMatterKey)) {
          tokens.push({
            tag: ("meta:" + frontMatterKey) as MetadataTokenType,
            ...flatReading(frontMatterValue),
            source: frontMatterSource,
          });
        }

        if (
          name === "BlockTitle" ||
          name === "InlineTitle" ||
          name === "BlockHeading" ||
          name === "InlineHeading" ||
          name === "BlockTransitional" ||
          name === "InlineTransitional" ||
          name === "BlockAction" ||
          name === "InlineAction" ||
          name === "ImplicitAction"
        ) {
          flushText();
          headingContinues = false;
        }

        if (name === "DialogueCharacter") {
          tokens.push({
            tag: "dialogue_character",
            ...flatReading(character),
            position,
            source: characterSource,
          });
          character = NO_TEXT;
          characterSource = [];
        }
        if (name === "BlockDialogue" || name === "InlineDialogue") {
          position = undefined;
        }

        if (name === "Choice") {
          tokens.push({
            tag: "choice",
            ...flatReading(choice),
            prefix: choice_prefix,
            suffix: choice_suffix,
            source: choiceSource,
            ...(positions ? { at: [...choicePrefixAt, ...flatten(placedOf(choice))] } : {}),
          });
          choice = NO_TEXT;
          choice_prefix = "";
          choicePrefixAt = [];
          choice_suffix = "";
          choiceSource = [];
        }

        if (TOKENS_ON_LEAVE.has(name)) {
          pendingTokens--;
          if (pendingTokens === 0 && heldSeparator !== undefined) {
            const held = heldSeparator;
            heldSeparator = undefined;
            addSeparator(held);
          }
        }

        stack.pop();
      },
    });

    while (tokens.at(0)?.tag === "separator") {
      tokens.shift();
    }
    while (tokens.at(-1)?.tag === "separator") {
      tokens.pop();
    }

    return tokens;
};

export default class ScreenplayParser {
  protected _parser = new TextmateGrammarParser(GRAMMAR_DEFINITION);

  parse(script: string): ScreenplayToken[] {
    if (!script) {
      return [];
    }
    return screenplayTokens(this.buildTree(script), script);
  }

  parseAll(scripts: string[]): ScreenplayToken[] {
    return scripts.flatMap((script) => this.parse(script));
  }

  buildTree(script: string): Tree {
    const paddedScript = script + "\n\n";
    return this._parser.parse(paddedScript);
  }
}
