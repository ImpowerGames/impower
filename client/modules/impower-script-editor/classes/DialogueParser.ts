import { fountainRegexes } from "../../impower-script-parser";
import { LeafBlockParser } from "../types/leafBlockParser";
import { Type } from "../types/type";
import { BlockContext } from "./BlockContext";
import { Element } from "./Element";
import { LeafBlock } from "./LeafBlock";
import { Line } from "./Line";

export class DialogueParser implements LeafBlockParser {
  characterName: string = undefined;

  inlineParenthetical: string = undefined;

  dual: boolean = undefined;

  lines: [Type, string][] = undefined;

  nextLine(cx: BlockContext, line: Line, leaf: LeafBlock): boolean {
    if (this.characterName === undefined) {
      const validCharacter = leaf.content.match(fountainRegexes.character);
      if (!validCharacter) {
        this.characterName = null;
        return false;
      }
      let character = leaf.content;
      let dualLength = 0;
      if (character[character.length - 1] === "^") {
        this.dual = true;
        character = character.slice(0, character.length - 1);
        dualLength = 1;
      }
      const parentheticalStartIndex = leaf.content.indexOf("(");
      const hasParenthetical = parentheticalStartIndex >= 0;
      this.characterName = hasParenthetical
        ? character.slice(0, parentheticalStartIndex - 1)
        : character;
      this.inlineParenthetical = hasParenthetical
        ? character.slice(
            parentheticalStartIndex - 1,
            character.length - dualLength
          )
        : null;
      this.lines = [];
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
      pos += this.characterName.length;
      children.push(cx.elt(Type.Character, startPos, pos));
      if (this.inlineParenthetical) {
        startPos = pos;
        pos += this.inlineParenthetical.length;
        children.push(cx.elt(Type.Parenthetical, startPos, pos));
      }
      if (this.dual) {
        startPos = pos;
        pos += 1;
        children.push(cx.elt(Type.DualDialogueMark, startPos, pos));
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
