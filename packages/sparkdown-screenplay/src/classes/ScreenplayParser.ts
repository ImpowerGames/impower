import { type SyntaxNode, Tree } from "@lezer/common";
import GRAMMAR_DEFINITION from "../../../sparkdown/language/sparkdown.language-grammar.json";
import type { SparkdownNodeName } from "../../../sparkdown/src/compiler/types/SparkdownNodeName";
import { readSkipping } from "../../../sparkdown/src/compiler/utils/readSkipping";
import { TextmateGrammarParser } from "../../../textmate-grammar-tree/src/tree/classes/TextmateGrammarParser";
import type { PrintedInsert } from "../types/PrintedInsert";
import { ScreenplayToken } from "../types/ScreenplayToken";
import { MetadataTokenType } from "../types/ScreenplayTokenType";
import { GLUED_ALTERNATOR_BLOCKS, gluedAlternatorJoin } from "../utils/gluedAlternatorLayout";
import { printsAsBlankLine } from "../utils/printsAsBlankLine";
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
    let frontMatterValue = "";
    let title = "";
    let heading = "";
    let transitional = "";
    let action = "";
    let choice = "";
    let choice_prefix = "";
    let choice_suffix = "";
    let character = "";
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
    const readWords = (node: SyntaxNode, source: number[]): string => {
      const text = readSkipping(
        node,
        readInto(source),
        (child) => TEXT_UNPRINTED.has(child.name),
      );
      if (leading) {
        leading = false;
        return text.trimStart();
      }
      return text;
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
    const readGlued = (block: SyntaxNode, source: number[], inserts: PrintedInsert[]): string => {
      const outer = sink;
      const arms: { text: string; ranges: number[] }[] = [];
      const cursor = block.cursor();
      while (cursor.next() && cursor.from < block.to) {
        if (cursor.name !== GLUED_ARM) continue;
        const ranges: number[] = [];
        const raw = readSkipping(cursor.node, readInto(ranges), (child) => ARM_UNPRINTED.has(child.name));
        const text = raw.trim();
        if (text) {
          arms.push({ text, ranges: trimRanges(ranges, raw.length - raw.trimStart().length, raw.length - raw.trimEnd().length) });
        }
      }
      sink = outer;
      if (arms.length === 0) return "";
      let text = gluedAlternatorJoin("before");
      inserts.push({ at: arms[0]!.ranges[0]!, text: gluedAlternatorJoin("before") });
      arms.forEach((arm, index) => {
        if (index > 0) {
          text += gluedAlternatorJoin("between");
          inserts.push({ at: arm.ranges[0]!, text: gluedAlternatorJoin("between") });
        }
        text += arm.text;
        source.push(...arm.ranges);
      });
      const after = gluedAlternatorJoin("after");
      if (after) {
        text += after;
        inserts.push({ at: arms.at(-1)!.ranges.at(-1)!, text: after });
      }
      return text;
    };
    const appendGlued = (lines: string, node: SyntaxNode, text: string) =>
      continuesBeforeGlued(node)
        ? `${lines.replace(/\n$/, "")}${text}\n`
        : `${lines}${text.trimStart()}\n`;
    const appendLine = (lines: string, node: SyntaxNode, text: string) =>
      continuesAfterComment(node)
        ? `${lines.replace(/\n$/, "")}${text}\n`
        : `${lines}${text}\n`;
    const readChoiceText = (node: SyntaxNode): string =>
      readSkipping(
        node,
        readInto(choiceSource),
        (child) => CHOICE_UNPRINTED.has(child.name) || GLUED_ALTERNATOR_BLOCKS.has(child.name),
        (child) => (GLUED_ALTERNATOR_BLOCKS.has(child.name) ? readGlued(child, choiceSource, choiceInserts) : ""),
      );

    let headingContinues = false;
    const flushText = () => {
      const source = textSource;
      textSource = [];
      const inserts = textInserts.length > 0 ? { inserts: textInserts } : {};
      textInserts = [];
      if (title) {
        tokens.push({ tag: "title", text: title, source, ...inserts });
        title = "";
      }
      if (heading) {
        tokens.push(
          headingContinues
            ? { tag: "heading", text: heading, continued: true, source, ...inserts }
            : { tag: "heading", text: heading, source, ...inserts },
        );
        heading = "";
        headingContinues = true;
      }
      if (transitional) {
        tokens.push({ tag: "transitional", text: transitional, source, ...inserts });
        transitional = "";
      }
      if (action) {
        tokens.push({ tag: "action", text: action, source, ...inserts });
        action = "";
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
          frontMatterValue = "";
        }
        if (name === "FrontMatterString") {
          const text = read(from, to);
          frontMatterValue += text;
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
          const text = readSkipping(nodeRef.node, readInto(textSource), (child) => ARM_UNPRINTED.has(child.name)).trim();
          if (text) {
            action = `${text}\n`;
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
              const inserts = (last.inserts ??= []);
              last.text = `${last.text ?? ""}${readGlued(nodeRef.node, (last.source ??= []), inserts)}`;
            } else {
              const source: number[] = [];
              const inserts: PrintedInsert[] = [];
              const text = readGlued(nodeRef.node, source, inserts).trimStart();
              if (text) tokens.push({ tag: "dialogue_content", text, position, source, inserts });
            }
          } else {
            const text = readGlued(nodeRef.node, textSource, textInserts);
            if (text) {
              if (stack.includes("BlockTitle") || stack.includes("InlineTitle")) {
                title = appendGlued(title, nodeRef.node, text);
              } else if (stack.includes("BlockHeading") || stack.includes("InlineHeading")) {
                heading = appendGlued(heading, nodeRef.node, text);
              } else if (stack.includes("BlockTransitional") || stack.includes("InlineTransitional")) {
                transitional = appendGlued(transitional, nodeRef.node, text);
              } else {
                action = appendGlued(action, nodeRef.node, text);
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
            textSource.push(from, to);
            const text = read(from, to);
            title += text + "\n";
          }
        }

        if (stack.includes("BlockHeading") || stack.includes("InlineHeading")) {
          if (name === "TextChunk") {
            heading = appendLine(heading, nodeRef.node, readWords(nodeRef.node, textSource));
          }
          if (name === "ParentheticalLineContent") {
            textSource.push(from, to);
            const text = read(from, to);
            heading += text + "\n";
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
            textSource.push(from, to);
            const text = read(from, to);
            transitional += text + "\n";
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
            textSource.push(from, to);
            const text = read(from, to);
            action += text + "\n";
          }
        }

        if (name === "DialogueCharacterName") {
          const text = read(from, to);
          character = text;
          characterSource = [from, to];
        }
        if (name === "DialogueCharacterParenthetical") {
          const text = read(from, to);
          character += text;
          characterSource.push(from, to);
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
              last.text = `${last.text ?? ""}${readWords(nodeRef.node, (last.source ??= []))}`;
            } else {
              const source: number[] = [];
              tokens.push({
                tag: "dialogue_content",
                text: readWords(nodeRef.node, source),
                position,
                source,
              });
            }
          }
          if (name === "ParentheticalLineContent") {
            const text = read(from, to);
            tokens.push({
              tag: "dialogue_parenthetical",
              text,
              position,
              source: [from, to],
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
            choice += readChoiceText(nodeRef.node);
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
            text: frontMatterValue,
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
            text: character,
            position,
            source: characterSource,
          });
          character = "";
          characterSource = [];
        }
        if (name === "BlockDialogue" || name === "InlineDialogue") {
          position = undefined;
        }

        if (name === "Choice") {
          tokens.push({
            tag: "choice",
            text: choice,
            prefix: choice_prefix,
            suffix: choice_suffix,
            source: choiceSource,
            ...(choiceInserts.length > 0 ? { inserts: choiceInserts } : {}),
          });
          choice = "";
          choiceSource = [];
          choiceInserts = [];
          choice_prefix = "";
          choice_suffix = "";
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
