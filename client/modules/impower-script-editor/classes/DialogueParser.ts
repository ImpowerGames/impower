import { fountainRegexes } from "../../impower-script-parser/constants/fountainRegexes";
import { LeafBlockParser } from "../types/leafBlockParser";
import { Type } from "../types/type";
import { BlockContext } from "./BlockContext";
import { Element } from "./Element";
import { LeafBlock } from "./LeafBlock";
import { Line } from "./Line";

export class DialogueParser implements LeafBlockParser {
  character: string = undefined;

  inlineParenthetical: string = undefined;

  lines: [Type, string][] = undefined;

  nextLine(cx: BlockContext, line: Line, leaf: LeafBlock): boolean {
    if (this.character === undefined) {
      const parentheticalStartIndex = leaf.content.indexOf("(");
      if (parentheticalStartIndex >= 0) {
        const character = leaf.content.slice(0, parentheticalStartIndex - 1);
        const inlineParenthetical = leaf.content.slice(
          parentheticalStartIndex - 1
        );
        const validCharacter = character.match(fountainRegexes.character);
        this.character = validCharacter ? character : null;
        this.inlineParenthetical = validCharacter ? inlineParenthetical : null;
        if (validCharacter) {
          this.lines = [];
        }
      } else {
        const character = leaf.content;
        const validCharacter = character.match(fountainRegexes.character);
        this.character = validCharacter ? character : null;
        this.inlineParenthetical = null;
        if (validCharacter) {
          this.lines = [];
        }
      }
    }
    if (this.lines) {
      this.lines.push([
        line.text.match(fountainRegexes.parenthetical)
          ? Type.Parenthetical
          : line.text.match(fountainRegexes.lyric)
          ? Type.Lyric
          : Type.Dialogue,
        line.text,
      ]);
    }
    return false;
  }

  finish(cx: BlockContext, leaf: LeafBlock): boolean {
    if (this.lines) {
      const children: Element[] = [];
      let startPos = leaf.start;
      let pos = leaf.start;
      startPos = pos;
      pos += this.character.length + 1;
      children.push(cx.elt(Type.Character, startPos, pos));
      if (this.inlineParenthetical) {
        startPos = pos;
        pos += this.inlineParenthetical.length;
        children.push(cx.elt(Type.Parenthetical, startPos, pos));
      }
      this.lines.forEach(([type, text]) => {
        startPos = pos;
        pos += text.length + 1;
        children.push(
          cx.elt(
            type,
            startPos,
            pos,
            type === Type.Parenthetical
              ? undefined
              : type === Type.Lyric
              ? [
                  new Element(Type.LyricMark, startPos, startPos + 1),
                  ...cx.parser.parseInline(text, startPos + 1),
                ]
              : [...cx.parser.parseInline(text, startPos)]
          )
        );
      });
      cx.addLeafElement(
        leaf,
        cx.elt(
          Type.Dialogue,
          leaf.start,
          leaf.start + leaf.content.length,
          children
        )
      );
    }
    return false;
  }
}
