/* eslint-disable no-cond-assign */
import { Tree } from "@lezer/common";
import { fountainRegexes } from "../../impower-script-parser";
import { BlockContext } from "../classes/BlockContext";
import { Element } from "../classes/Element";
import { Line } from "../classes/Line";
import { TreeElement } from "../classes/TreeElement";
import { BlockResult } from "../types/blockResult";
import { Type } from "../types/type";
import {
  addCodeText,
  getListIndent,
  inBlockContext,
  isAsset,
  isAssign,
  isBulletList,
  isCall,
  isCentered,
  isCharacter,
  isChoice,
  isCondition,
  isFencedCode,
  isGo,
  isHTMLBlock,
  isLyric,
  isOrderedList,
  isPageBreak,
  isParenthetical,
  isRepeat,
  isReturn,
  isScene,
  isSectionHeading,
  isSynopses,
  isTag,
  isTitle,
  isTransition,
  isVariable,
} from "../utils/markdown";
import { skipSpaceBack } from "../utils/skipSpaceBack";
import { space } from "../utils/space";
import {
  CommentEnd,
  EmptyLine,
  HTMLBlockStyle,
  ProcessingEnd,
} from "./regexes";

// Rules for parsing blocks. A return value of false means the rule
// doesn't apply here, true means it does. When true is returned and
// `p.line` has been updated, the rule is assumed to have consumed a
// leaf block. Otherwise, it is assumed to have opened a context.
export const DefaultBlockParsers: {
  [name: string]: ((cx: BlockContext, line: Line) => BlockResult) | undefined;
} = {
  Title(cx, line) {
    const size = isTitle(line, cx, false);
    if (size < 0) {
      return false;
    }
    if (
      cx.block.type !== Type.Title &&
      line.text?.toLowerCase().startsWith("title:")
    ) {
      cx.startContext(
        Type.Title,
        line.basePos,
        line.text.charCodeAt(line.pos + size - 1)
      );
    }
    if (!inBlockContext(cx, Type.Title)) {
      return false;
    }
    const newBase = getListIndent(line, line.pos + size);
    cx.startContext(Type.TitleEntry, line.basePos, newBase - line.baseIndent);
    cx.addNode(
      Type.TitleMark,
      cx.lineStart + line.pos,
      cx.lineStart + line.pos + size
    );
    line.moveBaseColumn(newBase);
    return null;
  },

  SectionHeading(cx, line) {
    const match = isSectionHeading(line);
    if (!match) {
      return false;
    }

    const mark = match[2] || "";
    const markSpace = match[3] || "";
    const off = line.pos;
    const from = cx.lineStart + off;
    const level = mark.length;

    if (level <= 0 || !markSpace) {
      let buf = cx.buffer;
      buf = buf.write(Type.PossibleSectionMark, 0, mark.length);
      const node = buf.finish(Type.PossibleSection, line.text.length - off);
      cx.addNode(node, cx.lineStart + line.pos);
      cx.nextLine();
      return true;
    }

    cx.startContext(Type.Section, 0, level);
    const endOfSpace = skipSpaceBack(line.text, line.text.length, off);
    let after = endOfSpace;
    while (after > off && line.text.charCodeAt(after - 1) === line.next) {
      after -= 1;
    }
    if (
      after === endOfSpace ||
      after === off ||
      !space(line.text.charCodeAt(after - 1))
    ) {
      after = line.text.length;
    }
    const buf = cx.buffer
      .write(Type.SectionMark, 0, level)
      .writeElements(
        cx.parser.parseInline(
          line.text.slice(off + level + 1, after),
          from + level + 1
        ),
        -from
      );
    const headingType = Type.SectionHeading1 - 1 + Math.min(6, level);

    const node = buf.finish(headingType, line.text.length - off);

    cx.addNode(node, cx.lineStart + line.pos);
    cx.nextLine();

    return true;
  },

  Synopses(cx, line) {
    const match = isSynopses(line);
    if (!match) {
      return false;
    }

    let buf = cx.buffer;
    let from = 0;
    let to = from;

    const mark = match[2] || "";
    const markSpace = match[3] || "";

    if (mark || markSpace) {
      from = to;
      to = from + mark.length + markSpace.length;
      buf = buf.write(Type.SynopsesMark, from, to);
    }

    const node = buf.finish(Type.Synopses, line.text.length - line.pos);

    cx.addNode(node, cx.lineStart + line.pos);
    cx.nextLine();

    return true;
  },

  Go(cx, line) {
    const match = isGo(line);
    if (!match) {
      return false;
    }

    let buf = cx.buffer;
    let from = 0;
    let to = from;

    const mark = match[2] || "";
    const markSpace = match[3] || "";
    const sectionName = match[4] || "";
    const sectionNameSpace = match[5] || "";

    if (mark || markSpace) {
      from = to;
      to = from + mark.length + markSpace.length;
      buf = buf.write(Type.GoMark, from, to);
    }
    if (sectionName || sectionNameSpace) {
      from = to;
      to = from + sectionName.length + sectionNameSpace.length;
      buf = buf.write(Type.GoSectionName, from, to);
    }

    const node = buf.finish(Type.Go, line.text.length - line.pos);

    cx.addNode(node, cx.lineStart + line.pos);
    cx.nextLine();

    return true;
  },

  Return(cx, line) {
    const match = isReturn(line);
    if (!match) {
      return false;
    }

    let buf = cx.buffer;
    let from = 0;
    let to = from;

    const mark = match[2] || "";
    const markSpace = match[3] || "";
    const value = match[4] || "";
    const valueSpace = match[5] || "";

    if (mark || markSpace) {
      from = to;
      to = from + mark.length + markSpace.length;
      buf = buf.write(Type.ReturnMark, from, to);
    }
    if (value || valueSpace) {
      from = to;
      to = from + value.length + valueSpace.length;
      buf = buf.write(Type.ReturnValue, from, to);
    }

    const node = buf.finish(Type.Return, line.text.length - line.pos);

    cx.addNode(node, cx.lineStart + line.pos);
    cx.nextLine();

    return true;
  },

  Repeat(cx, line) {
    const match = isRepeat(line);
    if (!match) {
      return false;
    }

    let buf = cx.buffer;
    let from = 0;
    let to = from;

    const mark = match[2] || "";
    const markSpace = match[3] || "";

    if (mark || markSpace) {
      from = to;
      to = from + mark.length + markSpace.length;
      buf = buf.write(Type.RepeatMark, from, to);
    }

    const node = buf.finish(Type.Repeat, line.text.length - line.pos);

    cx.addNode(node, cx.lineStart + line.pos);
    cx.nextLine();

    return true;
  },

  Asset(cx, line) {
    const match = isAsset(line);
    if (!match) {
      return false;
    }

    let buf = cx.buffer;
    let from = 0;
    let to = from;

    const mark = match[2] || "";
    const markSpace = match[3] || "";
    const name = match[4] || "";
    const nameSpace = match[5] || "";
    const operator = match[6] || "";
    const operatorSpace = match[7] || "";
    const value = match[8] || "";
    const valueSpace = match[9] || "";

    if (mark || markSpace) {
      from = to;
      to = from + mark.length + markSpace.length;
      buf = buf.write(Type.AssetMark, from, to);
    }
    if (name || nameSpace) {
      from = to;
      to = from + name.length + nameSpace.length;
      buf = buf.write(Type.AssetName, from, to);
    }
    if (operator || operatorSpace) {
      from = to;
      to = from + operator.length + operatorSpace.length;
      buf = buf.write(Type.AssetOperator, from, to);
    }
    if (value || valueSpace) {
      from = to;
      to = from + value.length + valueSpace.length;
      buf = buf.write(Type.AssetValue, from, to);
    }

    const node = buf.finish(Type.Asset, line.text.length - line.pos);

    cx.addNode(node, cx.lineStart + line.pos);
    cx.nextLine();

    return true;
  },

  Tag(cx, line) {
    const match = isTag(line);
    if (!match) {
      return false;
    }

    let buf = cx.buffer;
    let from = 0;
    let to = from;

    const mark = match[2] || "";
    const markSpace = match[3] || "";
    const name = match[4] || "";
    const nameSpace = match[5] || "";
    const operator = match[6] || "";
    const operatorSpace = match[7] || "";
    const value = match[8] || "";
    const valueSpace = match[9] || "";

    if (mark || markSpace) {
      from = to;
      to = from + mark.length + markSpace.length;
      buf = buf.write(Type.TagMark, from, to);
    }
    if (name || nameSpace) {
      from = to;
      to = from + name.length + nameSpace.length;
      buf = buf.write(Type.TagName, from, to);
    }
    if (operator || operatorSpace) {
      from = to;
      to = from + operator.length + operatorSpace.length;
      buf = buf.write(Type.TagOperator, from, to);
    }
    if (value || valueSpace) {
      from = to;
      to = from + value.length + valueSpace.length;
      buf = buf.write(Type.TagValue, from, to);
    }

    const node = buf.finish(Type.Tag, line.text.length - line.pos);

    cx.addNode(node, cx.lineStart + line.pos);
    cx.nextLine();

    return true;
  },

  Variable(cx, line) {
    const match = isVariable(line);
    if (!match) {
      return false;
    }

    let buf = cx.buffer;
    let from = 0;
    let to = from;

    const mark = match[2] || "";
    const markSpace = match[3] || "";
    const name = match[4] || "";
    const nameSpace = match[5] || "";
    const operator = match[6] || "";
    const operatorSpace = match[7] || "";
    const value = match[8] || "";
    const valueSpace = match[9] || "";

    if (mark || markSpace) {
      from = to;
      to = from + mark.length + markSpace.length;
      buf = buf.write(Type.VariableMark, from, to);
    }
    if (name || nameSpace) {
      from = to;
      to = from + name.length + nameSpace.length;
      buf = buf.write(Type.VariableName, from, to);
    }
    if (operator || operatorSpace) {
      from = to;
      to = from + operator.length + operatorSpace.length;
      buf = buf.write(Type.VariableOperator, from, to);
    }
    if (value || valueSpace) {
      from = to;
      to = from + value.length + valueSpace.length;
      buf = buf.write(Type.VariableValue, from, to);
    }

    const node = buf.finish(Type.Variable, line.text.length - line.pos);

    cx.addNode(node, cx.lineStart + line.pos);
    cx.nextLine();

    return true;
  },

  Transition(cx, line) {
    const match = isTransition(line);
    if (!match) {
      return false;
    }
    const node = cx.buffer.finish(Type.Transition, line.text.length - line.pos);
    cx.addNode(node, cx.lineStart + line.pos);
    cx.nextLine();
    return true;
  },

  PageBreak(cx, line) {
    const match = isPageBreak(line);
    if (!match) {
      return false;
    }
    const node = cx.buffer.finish(Type.PageBreak, line.text.length - line.pos);
    cx.addNode(node, cx.lineStart + line.pos);
    cx.nextLine();
    return true;
  },

  Scene(cx, line) {
    const match = isScene(line);
    if (!match) {
      return false;
    }

    let buf = cx.buffer;
    let from = 0;
    let to = from;

    const prefix = match[2] || "";
    const prefixSpace = match[3] || "";
    const location = match[4] || "";
    const locationSpace = match[5] || "";
    const separator = match[6] || "";
    const separatorSpace = match[7] || "";
    const time = match[8] || "";
    const timeSpace = match[9] || "";
    const numberOpenMark = match[10] || "";
    const number = match[11] || "";
    const numberCloseMark = match[12] || "";

    if (prefix || prefixSpace) {
      if (prefix.startsWith(".")) {
        from = to;
        to = from + 1;
        buf = buf.write(Type.SceneMark, from, to);
        from = to;
        to = from + prefix.length + prefixSpace.length - 1;
        buf = buf.write(Type.ScenePrefix, from, to);
      } else {
        from = to;
        to = from + prefix.length + prefixSpace.length;
        buf = buf.write(Type.ScenePrefix, from, to);
      }
    }
    if (location || locationSpace) {
      from = to;
      to = from + location.length + locationSpace.length;
      buf = buf.write(Type.SceneLocation, from, to);
    }
    if (separator || separatorSpace) {
      from = to;
      to = from + separator.length + separatorSpace.length;
      buf = buf.write(Type.SceneSeparatorMark, from, to);
    }
    if (time || timeSpace) {
      from = to;
      to = from + time.length + timeSpace.length;
      buf = buf.write(Type.SceneTime, from, to);
    }
    if (numberOpenMark) {
      from = to;
      to = from + numberOpenMark.length;
      buf = buf.write(Type.SceneNumberMark, from, to);
    }
    if (number) {
      from = to;
      to = from + number.length;
      buf = buf.write(Type.SceneNumber, from, to);
    }
    if (numberCloseMark) {
      from = to;
      to = from + numberCloseMark.length;
      buf = buf.write(Type.SceneNumberMark, from, to);
    }

    const node = buf.finish(Type.Scene, line.text.length - line.pos);

    cx.addNode(node, cx.lineStart + line.pos);
    cx.nextLine();

    return true;
  },

  Centered(cx, line) {
    const match = isCentered(line);
    if (!match) {
      return false;
    }
    let buf = cx.buffer;

    let from = 0;
    let to = from;

    const openMark = match[2] || "";
    const openMarkSpace = match[3] || "";
    const content = match[4] || "";
    const contentSpace = match[5] || "";
    const closeMark = match[6] || "";
    const closeMarkSpace = match[7] || "";

    if (openMark || openMarkSpace) {
      from = to;
      to = from + openMark.length + openMarkSpace.length;
      buf = buf.write(Type.CenteredMark, from, to);
    }
    if (content || contentSpace) {
      from = to;
      to = from + content.length + contentSpace.length;
    }
    if (closeMark || closeMarkSpace) {
      from = to;
      to = from + closeMark.length + closeMarkSpace.length;
      buf = buf.write(Type.CenteredMark, from, to);
    }

    const node = buf.finish(Type.Centered, line.text.length - line.pos);

    cx.addNode(node, cx.lineStart + line.pos);
    cx.nextLine();

    return true;
  },

  BulletList(cx, line) {
    const size = isBulletList(line, cx, false);
    if (size < 0) {
      return false;
    }

    const match =
      isAssign(line) || isCall(line) || isCondition(line) || isChoice(line);

    if (!match) {
      return false;
    }

    if (cx.block.type !== Type.BulletList) {
      cx.startContext(Type.BulletList, line.basePos, line.next);
    }
    const newBase = getListIndent(line, line.pos + 1);
    cx.startContext(Type.ListItem, line.basePos, newBase - line.baseIndent);

    let buf = cx.buffer;

    let from = 0;
    let to = from;
    let node: Tree;

    if (match?.[0] === "assign") {
      const mark = match[2] || "";
      const markSpace = match[3] || "";
      const name = match[4] || "";
      const nameSpace = match[5] || "";
      const operator = match[6] || "";
      const operatorSpace = match[7] || "";
      const value = match[8] || "";
      const valueSpace = match[9] || "";

      if (mark || markSpace) {
        from = to;
        to = from + mark.length + markSpace.length;
        buf = buf.write(Type.AssignMark, from, to);
      }
      if (name || nameSpace) {
        from = to;
        to = from + name.length + nameSpace.length;
        buf = buf.write(Type.AssignName, from, to);
      }
      if (operator || operatorSpace) {
        from = to;
        to = from + operator.length + operatorSpace.length;
        buf = buf.write(Type.AssignOperator, from, to);
      }
      if (value || valueSpace) {
        from = to;
        to = from + value.length + valueSpace.length;
        buf = buf.write(Type.AssignValue, from, to);
      }

      node = buf.finish(Type.Assign, line.text.length - line.pos);
    } else if (match?.[0] === "call") {
      const mark = match[2] || "";
      const markSpace = match[3] || "";
      const name = match[4] || "";
      const nameSpace = match[5] || "";
      const openMark = match[6] || "";
      const openMarkSpace = match[7] || "";
      const parameters = match[8] || "";
      const parametersSpace = match[9] || "";
      const closeMark = match[10] || "";
      const closeMarkSpace = match[11] || "";

      if (mark || markSpace) {
        from = to;
        to = from + mark.length + markSpace.length;
        buf = buf.write(Type.CallMark, from, to);
      }
      if (name || nameSpace) {
        from = to;
        to = from + name.length + nameSpace.length;
        buf = buf.write(Type.CallName, from, to);
      }
      if (openMark || openMarkSpace) {
        from = to;
        to = from + openMark.length + openMarkSpace.length;
        buf = buf.write(Type.CallOpenMark, from, to);
      }
      const paramMatches = parameters.match(fountainRegexes.parameter_values);
      if (paramMatches) {
        for (let i = 0; i < paramMatches.length; i += 1) {
          const paramMatch = paramMatches[i];
          const separatorMatch = paramMatch.match(fountainRegexes.separator);
          from = to;
          to = from + paramMatch.length;
          if (i === paramMatches.length - 1) {
            to += parametersSpace.length;
          }
          if (separatorMatch) {
            buf = buf.write(Type.CallSeparatorMark, from, to);
          } else if (i === 0) {
            buf = buf.write(Type.CallEntityName, from, to);
          } else {
            buf = buf.write(Type.CallValue, from, to);
          }
        }
      }
      if (closeMark) {
        from = to;
        to = from + closeMark.length + closeMarkSpace.length;
        buf = buf.write(Type.CallCloseMark, from, to);
      }

      node = buf.finish(Type.Call, line.text.length - line.pos);
    } else if (match?.[0] === "condition") {
      const mark = match[2] || "";
      const markSpace = match[3] || "";
      const variable = match[4] || "";
      const variableSpace = match[5] || "";
      const operator = match[6] || "";
      const operatorSpace = match[7] || "";
      const value = match[8] || "";
      const valueSpace = match[9] || "";
      const colon = match[10] || "";
      const colonSpace = match[11] || "";

      if (mark || markSpace) {
        from = to;
        to = from + mark.length + markSpace.length;
        buf = buf.write(Type.ConditionMark, from, to);
      }
      if (variable || variableSpace) {
        from = to;
        to = from + variable.length + variableSpace.length;
        buf = buf.write(Type.ConditionName, from, to);
      }
      if (operator || operatorSpace) {
        from = to;
        to = from + operator.length + operatorSpace.length;
        buf = buf.write(Type.ConditionOperator, from, to);
      }
      if (value || valueSpace) {
        from = to;
        to = from + value.length + valueSpace.length;
        buf = buf.write(Type.ConditionValue, from, to);
      }
      if (colon || colonSpace) {
        from = to;
        to = from + colon.length + colonSpace.length;
        buf = buf.write(Type.ConditionColonMark, from, to);
      }

      node = buf.finish(Type.Condition, line.text.length - line.pos);
    } else if (match?.[0] === "choice") {
      const mark = match[2] || "";
      const markSpace = match[3] || "";
      const content = match[4]?.trim() || "";
      const contentSpace = match[5]?.trim() || "";
      const angle = match[6]?.trim() || "";
      const angleSpace = match[7]?.trim() || "";
      const section = match[8]?.trim() || "";
      const sectionSpace = match[9]?.trim() || "";

      if (mark || markSpace) {
        from = to;
        to = from + mark.length + markSpace.length;
        buf = buf.write(Type.ChoiceMark, from, to);
      }
      if (content || contentSpace) {
        from = to;
        to = from + content.length + contentSpace.length;
        buf = buf.writeElements(cx.parser.parseInline(content, from));
      }
      if (angle || angleSpace) {
        from = to;
        to = from + angle.length + angleSpace.length;
        buf = buf.write(Type.ChoiceAngleMark, from, to);
      }
      if (section || sectionSpace) {
        from = to;
        to = from + section.length + sectionSpace.length;
        buf = buf.write(Type.ChoiceSectionName, from, to);
      }

      node = buf.finish(Type.Choice, line.text.length - line.pos);
    }

    cx.addNode(node, cx.lineStart + line.pos);
    cx.nextLine();

    return true;
  },

  Character(cx, line) {
    const match = isCharacter(line);
    if (!match) {
      return false;
    }
    if (inBlockContext(cx, Type.Dialogue)) {
      return false;
    }

    let characterMark = "";
    const character = match[1];
    let characterName = character;
    const parentheticalSpace = match[2];
    const parenthetical = match[3];
    const dualSpace = match[4];
    const dual = match[5];

    const text = line?.text;
    const off = line.pos;
    const from = cx.lineStart + off;
    const firstCharacterNextLine = cx.input.read(
      from + text.length + 1,
      from + text.length + 2
    );

    if (!characterName.startsWith("@") && !firstCharacterNextLine.trim()) {
      let buf = cx.buffer;
      buf = buf.write(
        Type.PossibleCharacterName,
        characterMark.length,
        characterMark.length + characterName.length
      );
      const node = buf.finish(Type.PossibleCharacter, text.length - off);
      cx.addNode(node, from);
      cx.nextLine();
      return true;
    }

    let buf = cx.buffer;
    cx.startContext(Type.Dialogue, line.basePos, line.next);

    if (characterName.startsWith("@")) {
      buf = buf.write(Type.CharacterMark, 0, 1);
      characterName = characterName.slice(1);
      characterMark = "@";
    }
    buf = buf.write(
      Type.CharacterName,
      characterMark.length,
      characterMark.length + characterName.length
    );
    let startPos = character.length;
    let endPos = startPos;
    if (parenthetical) {
      startPos = endPos + parentheticalSpace.length;
      endPos = startPos + parenthetical.length;
      buf.write(Type.CharacterParenthetical, startPos, endPos);
    }
    if (dual) {
      startPos = endPos + dualSpace.length;
      endPos = startPos + dual.length;
      buf.write(Type.CharacterDual, startPos, endPos);
    }
    const node = buf.finish(Type.Character, text.length - off);
    cx.addNode(node, from);
    cx.nextLine();
    return true;
  },

  Parenthetical(cx, line) {
    if (!inBlockContext(cx, Type.Dialogue)) {
      return false;
    }
    const match = isParenthetical(line);
    if (!match) {
      return false;
    }
    cx.addNode(
      Type.ParentheticalLine,
      cx.lineStart + line.pos,
      cx.lineStart + line.pos + line.text.length
    );
    cx.nextLine();
    return true;
  },

  Lyric(cx, line) {
    if (!inBlockContext(cx, Type.Dialogue)) {
      return false;
    }
    const match = isLyric(line);
    if (!match) {
      return false;
    }
    const size = 1;
    const from = cx.lineStart + line.pos;
    const buf = cx.buffer
      .write(Type.LyricMark, 0, size)
      .writeElements(
        cx.parser.parseInline(line.text.slice(size), from + size),
        -from
      );
    const node = buf.finish(Type.Lyric, line.text.length);
    cx.nextLine();
    cx.addNode(node, from);
    return true;
  },

  Dialogue(cx, line) {
    if (!inBlockContext(cx, Type.Dialogue)) {
      return false;
    }
    const off = line.pos;
    const from = cx.lineStart + off;
    let buf = cx.buffer;
    buf = buf.writeElements(cx.parser.parseInline(line.text, from), -from);
    const node = buf.finish(Type.DialogueLine, line.text.length - off);
    cx.addNode(node, from);
    cx.nextLine();
    return true;
  },

  OrderedList(cx, line) {
    const size = isOrderedList(line, cx, false);
    if (size < 0) {
      return false;
    }
    if (cx.block.type !== Type.OrderedList) {
      cx.startContext(
        Type.OrderedList,
        line.basePos,
        line.text.charCodeAt(line.pos + size - 1)
      );
    }
    const newBase = getListIndent(line, line.pos + size);
    cx.startContext(Type.ListItem, line.basePos, newBase - line.baseIndent);
    cx.addNode(
      Type.ListMark,
      cx.lineStart + line.pos,
      cx.lineStart + line.pos + size
    );
    line.moveBaseColumn(newBase);
    return null;
  },

  FencedCode(cx, line) {
    const fenceEnd = isFencedCode(line);
    if (fenceEnd < 0) {
      return false;
    }
    const from = cx.lineStart + line.pos;
    const ch = line.next;
    const len = fenceEnd - line.pos;
    const infoFrom = line.skipSpace(fenceEnd);
    const infoTo = skipSpaceBack(line.text, line.text.length, infoFrom);
    const marks: (Element | TreeElement)[] = [
      new Element(Type.CodeMark, from, from + len),
    ];
    if (infoFrom < infoTo)
      marks.push(
        new Element(
          Type.CodeInfo,
          cx.lineStart + infoFrom,
          cx.lineStart + infoTo
        )
      );

    for (
      let first = true;
      cx.nextLine() && line.depth >= cx.stack.length;
      first = false
    ) {
      let i = line.pos;
      if (line.indent - line.baseIndent < 4) {
        while (i < line.text.length && line.text.charCodeAt(i) === ch) {
          i += 1;
        }
      }
      if (i - line.pos >= len && line.skipSpace(i) === line.text.length) {
        for (let i = 0; i < line.markers.length; i += 1) {
          const m = line.markers[i];
          marks.push(m);
        }
        marks.push(
          new Element(Type.CodeMark, cx.lineStart + line.pos, cx.lineStart + i)
        );
        cx.nextLine();
        break;
      } else {
        if (!first) {
          addCodeText(marks, cx.lineStart - 1, cx.lineStart);
        }
        for (let i = 0; i < line.markers.length; i += 1) {
          const m = line.markers[i];
          marks.push(m);
        }
        const textStart = cx.lineStart + line.basePos;
        const textEnd = cx.lineStart + line.text.length;
        if (textStart < textEnd) {
          addCodeText(marks, textStart, textEnd);
        }
      }
    }
    cx.addNode(
      cx.buffer
        .writeElements(marks, -from)
        .finish(Type.FencedCode, cx.prevLineEnd() - from),
      from
    );
    return true;
  },

  HTMLBlock(cx, line) {
    const type = isHTMLBlock(line, cx, false);
    if (type < 0) {
      return false;
    }
    const from = cx.lineStart + line.pos;
    const end = HTMLBlockStyle[type][1];
    const marks: Element[] = [];
    let trailing = end !== EmptyLine;
    while (!end.test(line.text) && cx.nextLine()) {
      if (line.depth < cx.stack.length) {
        trailing = false;
        break;
      }
      for (let i = 0; i < line.markers.length; i += 1) {
        const m = line.markers[i];
        marks.push(m);
      }
    }
    if (trailing) cx.nextLine();
    const nodeType =
      end === CommentEnd
        ? Type.CommentBlock
        : end === ProcessingEnd
        ? Type.ProcessingInstructionBlock
        : Type.HTMLBlock;
    const to = cx.prevLineEnd();
    cx.addNode(
      cx.buffer.writeElements(marks, -from).finish(nodeType, to - from),
      from
    );
    return true;
  },
};
