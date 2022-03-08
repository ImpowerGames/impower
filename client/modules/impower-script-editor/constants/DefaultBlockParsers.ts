/* eslint-disable no-cond-assign */
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
  isCentered,
  isCharacter,
  isDeclare,
  isFencedCode,
  isGo,
  isHorizontalRule,
  isHTMLBlock,
  isJump,
  isLyric,
  isOrderedList,
  isParenthetical,
  isReturn,
  isSceneHeading,
  isSectionHeading,
  isSynopses,
  isTag,
  isTitle,
  isTransition,
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
  LinkReference: undefined,

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

  Synopses(cx, line) {
    const size = isSynopses(line);
    if (size < 0) {
      return false;
    }
    const from = cx.lineStart + line.pos;
    const buf = cx.buffer
      .write(Type.SynopsesMark, 0, size)
      .writeElements(
        cx.parser.parseInline(line.text.slice(size), from + size),
        -from
      );
    const node = buf.finish(Type.Synopses, line.text.length);
    cx.nextLine();
    cx.addNode(node, from);
    return true;
  },

  Go(cx, line) {
    const size = isGo(line);
    if (size < 0) {
      return false;
    }
    const from = cx.lineStart + line.pos;
    cx.nextLine();
    cx.addNode(Type.Go, from);
    return true;
  },

  Jump(cx, line) {
    const size = isJump(line);
    if (size < 0) {
      return false;
    }
    const from = cx.lineStart + line.pos;
    cx.nextLine();
    cx.addNode(Type.Jump, from);
    return true;
  },

  Return(cx, line) {
    const size = isReturn(line);
    if (size < 0) {
      return false;
    }
    const from = cx.lineStart + line.pos;
    cx.nextLine();
    cx.addNode(Type.Return, from);
    return true;
  },

  Asset(cx, line) {
    const match = isAsset(line);
    if (!match) {
      return false;
    }
    const mark = match[2];
    const markSpace = match[3];
    const name = match[4];
    const nameSpace = match[5];
    const operator = match[6];
    const operatorSpace = match[7];
    const value = match[8];
    const from = cx.lineStart + line.pos;
    const els: Element[] = [];
    let posFrom = from;
    let posTo = posFrom + mark.length;
    els.push(new Element(Type.AssetMark, posFrom, posTo));
    posFrom = posTo + markSpace.length;
    posTo = posFrom + name.length;
    els.push(new Element(Type.AssetName, posFrom, posTo));
    posFrom = posTo + nameSpace.length;
    posTo = posFrom + operator.length;
    els.push(new Element(Type.AssetOperator, posFrom, posTo));
    posFrom = posTo + operatorSpace.length;
    posTo = posFrom + value.length;
    els.push(new Element(Type.AssetValue, posFrom, posTo));
    cx.addNode(
      cx.buffer.writeElements(els, -from).finish(Type.Asset, line.text.length),
      from
    );
    cx.nextLine();
    return true;
  },

  Tag(cx, line) {
    const match = isTag(line);
    if (!match) {
      return false;
    }
    const mark = match[2];
    const markSpace = match[3];
    const name = match[4];
    const nameSpace = match[5];
    const operator = match[6];
    const operatorSpace = match[7];
    const value = match[8];
    const from = cx.lineStart + line.pos;
    const els: Element[] = [];
    let posFrom = from;
    let posTo = posFrom + mark.length;
    els.push(new Element(Type.TagMark, posFrom, posTo));
    posFrom = posTo + markSpace.length;
    posTo = posFrom + name.length;
    els.push(new Element(Type.TagName, posFrom, posTo));
    posFrom = posTo + nameSpace.length;
    posTo = posFrom + operator.length;
    els.push(new Element(Type.TagOperator, posFrom, posTo));
    posFrom = posTo + operatorSpace.length;
    posTo = posFrom + value.length;
    els.push(new Element(Type.TagValue, posFrom, posTo));
    cx.addNode(
      cx.buffer.writeElements(els, -from).finish(Type.Tag, line.text.length),
      from
    );
    cx.nextLine();
    return true;
  },

  Declare(cx, line) {
    const match = isDeclare(line);
    if (!match) {
      return false;
    }
    const mark = match[2];
    const markSpace = match[3];
    const name = match[4];
    const nameSpace = match[5];
    const operator = match[6];
    const operatorSpace = match[7];
    const value = match[8];
    const from = cx.lineStart + line.pos;
    const els: Element[] = [];
    let posFrom = from;
    let posTo = posFrom + mark.length;
    els.push(new Element(Type.DeclareMark, posFrom, posTo));
    posFrom = posTo + markSpace.length;
    posTo = posFrom + name.length;
    els.push(new Element(Type.DeclareName, posFrom, posTo));
    posFrom = posTo + nameSpace.length;
    posTo = posFrom + operator.length;
    els.push(new Element(Type.DeclareOperator, posFrom, posTo));
    posFrom = posTo + operatorSpace.length;
    posTo = posFrom + value.length;
    els.push(new Element(Type.DeclareValue, posFrom, posTo));
    cx.addNode(
      cx.buffer
        .writeElements(els, -from)
        .finish(Type.Declare, line.text.length),
      from
    );
    cx.nextLine();
    return true;
  },

  Assign(cx, line) {
    const match = isAssign(line);
    if (!match) {
      return false;
    }
    const mark = match[2];
    const markSpace = match[3];
    const name = match[4];
    const nameSpace = match[5];
    const operator = match[6];
    const operatorSpace = match[7];
    const value = match[8];
    const from = cx.lineStart + line.pos;
    const els: Element[] = [];
    let posFrom = from;
    let posTo = posFrom + mark.length;
    els.push(new Element(Type.AssignMark, posFrom, posTo));
    posFrom = posTo + markSpace.length;
    posTo = posFrom + name.length;
    els.push(new Element(Type.AssignName, posFrom, posTo));
    posFrom = posTo + nameSpace.length;
    posTo = posFrom + operator.length;
    els.push(new Element(Type.AssignOperator, posFrom, posTo));
    posFrom = posTo + operatorSpace.length;
    posTo = posFrom + value.length;
    els.push(new Element(Type.AssignValue, posFrom, posTo));
    cx.addNode(
      cx.buffer.writeElements(els, -from).finish(Type.Assign, line.text.length),
      from
    );
    cx.nextLine();
    return true;
  },

  Transition(cx, line) {
    const size = isTransition(line);
    if (size < 0) {
      return false;
    }
    const from = cx.lineStart + line.pos;
    cx.nextLine();
    cx.addNode(Type.Transition, from);
    return true;
  },

  HorizontalRule(cx, line) {
    if (isHorizontalRule(line) < 0) {
      return false;
    }
    const from = cx.lineStart + line.pos;
    cx.nextLine();
    cx.addNode(Type.HorizontalRule, from);
    return true;
  },

  SceneHeading(cx, line) {
    const size = isSceneHeading(line);
    if (size < 0) {
      return false;
    }
    const off = line.pos;
    const from = cx.lineStart + off;
    let buf = cx.buffer;

    if (size > 0) {
      buf = buf.write(Type.SceneHeadingMark, 0, size);
    }
    const fullSceneHeading = line.text.slice(off + size + 1);
    let sceneName = fullSceneHeading;
    const sceneNumberMatch = line.text.match(fountainRegexes.scene_number);
    if (sceneNumberMatch) {
      const sceneNumberLength = sceneNumberMatch[1].length + 2;
      sceneName = sceneName.slice(0, -sceneNumberLength);
    }
    buf = buf.writeElements(
      cx.parser.parseInline(sceneName, from + size + 1),
      -from
    );
    if (sceneNumberMatch) {
      buf.write(
        Type.SceneNumber,
        size + sceneName.length + 1,
        line.text.length - off
      );
    }
    const node = buf.finish(Type.SceneHeading, line.text.length - off);
    cx.nextLine();
    cx.addNode(node, from);
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
    cx.startContext(Type.Dialogue, line.basePos, line.next);
    const off = line.pos;
    const from = cx.lineStart + off;
    let buf = cx.buffer;

    let characterMark = "";
    const character = match[1];
    let characterName = character;
    const parentheticalSpace = match[2];
    const parenthetical = match[3];
    const dualSpace = match[4];
    const dual = match[5];
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
    const node = buf.finish(Type.Character, line.text.length - off);
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

  BulletList(cx, line) {
    const size = isBulletList(line, cx, false);
    if (size < 0) {
      return false;
    }
    if (cx.block.type !== Type.BulletList) {
      cx.startContext(Type.BulletList, line.basePos, line.next);
    }
    const newBase = getListIndent(line, line.pos + 1);
    cx.startContext(Type.ListItem, line.basePos, newBase - line.baseIndent);
    if (line.next === "?".charCodeAt(0)) {
      cx.addNode(
        Type.Trigger,
        cx.lineStart + line.pos,
        cx.lineStart + line.text.length
      );
    } else {
      cx.addNode(
        Type.ListMark,
        cx.lineStart + line.pos,
        cx.lineStart + line.pos + size
      );
    }
    line.moveBaseColumn(newBase);
    return null;
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

  Centered(cx, line) {
    const size = isCentered(line);
    if (size < 0) {
      return false;
    }
    const charCodeEnd = "<".charCodeAt(0);
    const off = line.pos;
    const from = cx.lineStart + off;
    const endOfSpace = skipSpaceBack(line.text, line.text.length, off);
    let after = endOfSpace;
    while (after > off && line.text.charCodeAt(after - 1) === charCodeEnd) {
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
      .write(Type.CenteredMark, 0, size)
      .writeElements(
        cx.parser.parseInline(line.text.slice(off + size, after), from + size),
        -from
      );
    buf.write(
      Type.CenteredMark,
      line.text.length - off - 1,
      line.text.length - off
    );
    const node = buf.finish(Type.Centered, line.text.length - off);
    cx.nextLine();
    cx.addNode(node, from);
    return true;
  },

  SectionHeading(cx, line) {
    const size = isSectionHeading(line);
    if (size < 0) {
      return false;
    }
    cx.startContext(Type.Section, 0, size);
    const off = line.pos;
    const from = cx.lineStart + off;
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
      .write(Type.SectionMark, 0, size)
      .writeElements(
        cx.parser.parseInline(
          line.text.slice(off + size + 1, after),
          from + size + 1
        ),
        -from
      );
    const headingType = Type.SectionHeading1 - 1 + Math.min(6, size);
    const node = buf.finish(headingType, line.text.length - off);
    cx.addNode(node, from);
    line.moveBase(line.pos + 1);
    return null;
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
