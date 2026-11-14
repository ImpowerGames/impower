import { type SyntaxNode, Tree } from "@lezer/common";
import GRAMMAR_DEFINITION from "../../../sparkdown/language/sparkdown.language-grammar.json";
import type { SparkdownNodeName } from "../../../sparkdown/src/compiler/types/SparkdownNodeName";
import { readSkipping } from "../../../sparkdown/src/compiler/utils/readSkipping";
import { trimStyled } from "../../../sparkdown/src/runtime/displayStyle";
import { TextmateGrammarParser } from "../../../textmate-grammar-tree/src/tree/classes/TextmateGrammarParser";
import type { PrintedInsert } from "../types/PrintedInsert";
import { ScreenplayToken } from "../types/ScreenplayToken";
import { MetadataTokenType } from "../types/ScreenplayTokenType";
import { GLUED_ALTERNATOR_BLOCKS, gluedAlternatorJoin } from "../utils/gluedAlternatorLayout";
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

interface Reading {
  text: string;
  styled: string;
}

const NO_TEXT: Reading = { text: "", styled: "" };

const NEWLINE: Reading = { text: "\n", styled: "\n" };

const join = (...parts: Reading[]): Reading => ({
  text: parts.map((part) => part.text).join(""),
  styled: parts.map((part) => part.styled).join(""),
});

const plain = (text: string): Reading => ({ text, styled: text });

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

export const screenplayTokens = (tree: Tree, script: string): ScreenplayToken[] => {
    const stack: SparkdownNodeName[] = [];
    const tokens: ScreenplayToken[] = [{ tag: "page_break" }];
    let frontMatterKey = "";
    let frontMatterValue = NO_TEXT;
    let title = NO_TEXT;
    let heading = NO_TEXT;
    let transitional = NO_TEXT;
    let action = NO_TEXT;
    let choice = NO_TEXT;
    let choice_prefix = "";
    let choice_suffix = "";
    let character = NO_TEXT;
    let position: "l" | "r" | undefined = undefined;
    let textSource: number[] = [];
    let characterSource: number[] = [];
    let choiceSource: number[] = [];
    let textInserts: PrintedInsert[] = [];
    let choiceInserts: PrintedInsert[] = [];
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
      const styled = readStyled(node, read, isTextUnprinted);
      if (leading) {
        leading = false;
        return { text: text.trimStart(), styled: trimStyled(styled, { end: false }) };
      }
      return { text, styled };
    };
    const readLine = (node: SyntaxNode, source?: number[]): Reading => {
      if (source && node.to > node.from) source.push(node.from, node.to);
      return { text: read(node.from, node.to), styled: readStyled(node, read) };
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
    const withoutEndNewline = (lines: Reading): Reading => ({
      text: lines.text.replace(/\n$/, ""),
      styled: lines.styled.replace(/\n$/, ""),
    });
    const appendLine = (lines: Reading, node: SyntaxNode, line: Reading): Reading =>
      continuesAfterComment(node)
        ? join(withoutEndNewline(lines), line, NEWLINE)
        : join(lines, line, NEWLINE);
    const appendGlued = (lines: Reading, node: SyntaxNode, glued: Reading): Reading =>
      continuesBeforeGlued(node)
        ? join(withoutEndNewline(lines), glued, NEWLINE)
        : join(lines, { text: glued.text.trimStart(), styled: trimStyled(glued.styled, { end: false }) }, NEWLINE);
    const readArm = (arm: SyntaxNode, source: number[]): { reading: Reading; ranges: number[] } | undefined => {
      const outer = sink;
      const ranges: number[] = [];
      const raw = readSkipping(arm, readInto(ranges), isArmUnprinted);
      sink = outer;
      const text = raw.trim();
      if (!text) return undefined;
      const trimmed = trimRanges(ranges, raw.length - raw.trimStart().length, raw.length - raw.trimEnd().length);
      source.push(...trimmed);
      return { reading: { text, styled: trimStyled(readStyled(arm, read, isArmUnprinted)) }, ranges: trimmed };
    };
    const readGlued = (block: SyntaxNode, source: number[], inserts: PrintedInsert[]): Reading => {
      const arms: { reading: Reading; ranges: number[] }[] = [];
      const cursor = block.cursor();
      while (cursor.next() && cursor.from < block.to) {
        if (cursor.name !== GLUED_ARM) continue;
        const arm = readArm(cursor.node, source);
        if (arm) arms.push(arm);
      }
      if (arms.length === 0) return NO_TEXT;
      const parts: Reading[] = [plain(gluedAlternatorJoin("before"))];
      inserts.push({ at: arms[0]!.ranges[0]!, text: gluedAlternatorJoin("before") });
      arms.forEach((arm, index) => {
        if (index > 0) {
          parts.push(plain(gluedAlternatorJoin("between")));
          inserts.push({ at: arm.ranges[0]!, text: gluedAlternatorJoin("between") });
        }
        parts.push(arm.reading);
      });
      const after = gluedAlternatorJoin("after");
      if (after) {
        parts.push(plain(after));
        inserts.push({ at: arms.at(-1)!.ranges.at(-1)!, text: after });
      }
      return join(...parts);
    };
    const readChoiceText = (node: SyntaxNode): Reading => {
      const glued = new Map<number, Reading>();
      const gluedReading = (child: SyntaxNode) => {
        if (!GLUED_ALTERNATOR_BLOCKS.has(child.name)) return undefined;
        let reading = glued.get(child.from);
        if (!reading) {
          reading = readGlued(child, choiceSource, choiceInserts);
          glued.set(child.from, reading);
        }
        return reading;
      };
      const text = readSkipping(node, readInto(choiceSource), isChoiceUnprinted, (child) => gluedReading(child)?.text ?? "");
      const styled = readStyled(node, read, isChoiceUnprinted, (child) => gluedReading(child)?.styled);
      return { text, styled };
    };

    let headingContinues = false;
    const flushText = () => {
      const source = textSource;
      textSource = [];
      const inserts = textInserts.length > 0 ? { inserts: textInserts } : {};
      textInserts = [];
      if (title.text) {
        tokens.push({ tag: "title", ...title, source, ...inserts });
        title = NO_TEXT;
      }
      if (heading.text) {
        tokens.push(
          headingContinues
            ? { tag: "heading", ...heading, continued: true, source, ...inserts }
            : { tag: "heading", ...heading, source, ...inserts },
        );
        heading = NO_TEXT;
        headingContinues = true;
      }
      if (transitional.text) {
        tokens.push({ tag: "transitional", ...transitional, source, ...inserts });
        transitional = NO_TEXT;
      }
      if (action.text) {
        tokens.push({ tag: "action", ...action, source, ...inserts });
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
        }
        if (name === "FrontMatterString") {
          frontMatterValue = join(frontMatterValue, readLine(nodeRef.node));
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
              const glued = readGlued(nodeRef.node, (last.source ??= []), (last.inserts ??= []));
              last.text = `${last.text ?? ""}${glued.text}`;
              last.styled = `${last.styled ?? ""}${glued.styled}`;
            } else {
              const source: number[] = [];
              const inserts: PrintedInsert[] = [];
              const glued = readGlued(nodeRef.node, source, inserts);
              if (glued.text) {
                tokens.push({
                  tag: "dialogue_content",
                  text: glued.text.trimStart(),
                  styled: trimStyled(glued.styled, { end: false }),
                  position,
                  source,
                  inserts,
                });
              }
            }
          } else {
            const glued = readGlued(nodeRef.node, textSource, textInserts);
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
              const words = readWords(nodeRef.node, (last.source ??= []));
              last.text = `${last.text ?? ""}${words.text}`;
              last.styled = `${last.styled ?? ""}${words.styled}`;
            } else {
              const source: number[] = [];
              tokens.push({
                tag: "dialogue_content",
                ...readWords(nodeRef.node, source),
                position,
                source,
              });
            }
          }
          if (name === "ParentheticalLineContent") {
            const source: number[] = [];
            tokens.push({
              tag: "dialogue_parenthetical",
              ...readLine(nodeRef.node, source),
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
            ...frontMatterValue,
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
            ...character,
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
            ...choice,
            prefix: choice_prefix,
            suffix: choice_suffix,
            source: choiceSource,
            ...(choiceInserts.length > 0 ? { inserts: choiceInserts } : {}),
          });
          choice = NO_TEXT;
          choice_prefix = "";
          choice_suffix = "";
          choiceSource = [];
          choiceInserts = [];
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
