/* eslint-disable no-cond-assign */
import { Tree } from "@lezer/common";
import { tokenize } from "../../../../spark-evaluate";
import { entityMethods, MethodType, sparkRegexes } from "../../../../sparkdown";
import { BlockContext } from "../classes/BlockContext";
import { Element } from "../classes/Element";
import { Line } from "../classes/Line";
import { MarkdownBuffer } from "../classes/MarkdownBuffer";
import { TreeElement } from "../classes/TreeElement";
import { BlockResult } from "../types/blockResult";
import { Type } from "../types/type";
import {
  addCodeText,
  getListIndent,
  inBlockContext,
  isAssign,
  isBulletList,
  isCall,
  isCentered,
  isCharacter,
  isChoice,
  isComment,
  isCondition,
  isFencedCode,
  isHTMLBlock,
  isImport,
  isJump,
  isLyric,
  isOrderedList,
  isPageBreak,
  isParenthetical,
  isRepeat,
  isReturn,
  isScene,
  isSectionHeading,
  isStruct,
  isStructListValue,
  isStructObjectField,
  isStructValueField,
  isSynopsis,
  isTitle,
  isTransition,
  isVariable,
} from "../utils/markdown";
import { skipSpaceBack } from "../utils/skipSpaceBack";
import {
  CommentEnd,
  EmptyLine,
  HTMLBlockStyle,
  ProcessingEnd,
} from "./regexes";

export const parseTemplateString = (
  buf: MarkdownBuffer,
  content: string,
  from: number,
  to: number
): MarkdownBuffer => {
  to = from;
  const stringArr = content.split(sparkRegexes.interpolation_splitter);
  stringArr.forEach((m) => {
    const interpolationTokenMatch = m.match(sparkRegexes.interpolation_token);
    if (interpolationTokenMatch) {
      const interpolationOpenMark = interpolationTokenMatch[1] || "";
      const interpolationOpenMarkSpace = interpolationTokenMatch[2] || "";
      const interpolationVariableName = interpolationTokenMatch[3] || "";
      const interpolationVariableNameSpace = interpolationTokenMatch[4] || "";
      const interpolationCloseMark = interpolationTokenMatch[5] || "";
      from = to;
      to =
        from + interpolationOpenMark.length + interpolationOpenMarkSpace.length;
      buf = buf.write(Type.InterpolationOpenMark, from, to);
      from = to;
      to =
        from +
        interpolationVariableName.length +
        interpolationVariableNameSpace.length;
      buf = buf.write(Type.InterpolationVariableName, from, to);
      from = to;
      to = from + interpolationCloseMark.length;
      buf = buf.write(Type.InterpolationCloseMark, from, to);
    } else {
      from = to;
      to = from + m.length;
      buf = buf.write(Type.String, from, to);
    }
  });
  return buf;
};

export const parseExpression = (
  buf: MarkdownBuffer,
  expression: string,
  from: number,
  to: number
): MarkdownBuffer => {
  const [tokens] = tokenize(expression);
  const exprFrom = from;
  tokens.forEach((t) => {
    if (!Number.isNaN(Number(t.content))) {
      buf = buf.write(Type.Number, exprFrom + t.from, exprFrom + t.to);
    }
    if (sparkRegexes.string_template.test(t.content)) {
      from = exprFrom + t.from;
      to = exprFrom + t.from;
      buf = parseTemplateString(buf, t.content, from, to);
    } else if (sparkRegexes.string.test(t.content)) {
      buf = buf.write(Type.String, exprFrom + t.from, exprFrom + t.to);
    }
    if (sparkRegexes.boolean.test(t.content)) {
      buf = buf.write(Type.Boolean, exprFrom + t.from, exprFrom + t.to);
    }
    const variableMatch = t.content.match(sparkRegexes.variableAccess);
    if (variableMatch) {
      const name = variableMatch[1] || "";
      const fieldAccess = variableMatch[2] || "";
      if (fieldAccess) {
        from = exprFrom + t.from;
        to = exprFrom + name.length;
        buf = buf.write(Type.StructName, from, to);
        fieldAccess.split(/([.])/).forEach((f) => {
          from = to;
          to = from + f.length;
          if (f !== ".") {
            buf = buf.write(Type.StructFieldAccess, from, to);
          }
        });
      } else {
        buf = buf.write(Type.VariableName, exprFrom + t.from, exprFrom + t.to);
      }
    }
  });
  return buf;
};

// Rules for parsing blocks. A return value of false means the rule
// doesn't apply here, true means it does. When true is returned and
// `p.line` has been updated, the rule is assumed to have consumed a
// leaf block. Otherwise, it is assumed to have opened a context.
export const DefaultBlockParsers: {
  [name: string]: ((cx: BlockContext, line: Line) => BlockResult) | undefined;
} = {
  Comment(cx, line) {
    const match = isComment(line);
    if (!match) {
      return false;
    }
    const from = cx.lineStart + line.pos;
    const buf = cx.buffer;
    const node = buf.finish(Type.Comment, line.text.length);
    cx.nextLine();
    cx.addNode(node, from);
    return true;
  },

  Struct(cx, line) {
    const match = isStruct(line);
    if (!match) {
      return false;
    }

    let buf = cx.buffer;
    let from = 0;
    let to = from;

    const type = match[2] || "";
    const typeSpace = match[3] || "";
    const name = match[4] || "";
    const nameSpace = match[5] || "";
    const openMark = match[6] || "";
    const openMarkSpace = match[7] || "";
    const base = match[8] || "";
    const baseSpace = match[9] || "";
    const closeMark = match[10] || "";
    const closeMarkSpace = match[11] || "";
    const colon = match[12] || "";
    const colonSpace = match[13] || "";
    if (colon) {
      cx.startContext(Type.Struct, line.basePos, line.next);
      if (type === "list") {
        cx.startContext(Type.StructList, line.basePos, line.next);
      }
    }

    if (type || typeSpace) {
      from = to;
      to = from + type.length + typeSpace.length;
      buf = buf.write(Type.StructMark, from, to);
    }
    if (name || nameSpace) {
      from = to;
      to = from + name.length + nameSpace.length;
      buf = buf.write(Type.StructName, from, to);
    }
    if (openMark || openMarkSpace) {
      from = to;
      to = from + openMark.length + openMarkSpace.length;
      buf = buf.write(Type.StructOpenMark, from, to);
    }
    if (base || baseSpace) {
      from = to;
      to = from + base.length + baseSpace.length;
      buf = buf.write(Type.StructBase, from, to);
    }
    if (closeMark || closeMarkSpace) {
      from = to;
      to = from + closeMark.length + closeMarkSpace.length;
      buf = buf.write(Type.StructCloseMark, from, to);
    }
    if (colon || colonSpace) {
      from = to;
      to = from + colon.length + colonSpace.length;
      buf = buf.write(Type.StructColon, from, to);
    }
    from = to;
    to = line.text.length - line.pos;
    if (to > from) {
      buf = buf.write(Type.Comment, from, to);
    }
    const node = buf.finish(Type.Struct, line.text.length - line.pos);
    cx.addNode(node, cx.lineStart + line.pos);
    cx.nextLine();
    return true;
  },

  StructListValue(cx, line) {
    if (!inBlockContext(cx, Type.Struct)) {
      return false;
    }

    let buf = cx.buffer;
    let from = 0;
    let to = from;

    if (inBlockContext(cx, Type.StructList)) {
      const listValueMatch = isStructListValue(line);
      if (listValueMatch) {
        const value = listValueMatch[2] || "";
        const valueSpace = listValueMatch[3] || "";
        const operator = listValueMatch[4] || "";
        const operatorSpace = listValueMatch[5] || "";
        if (value) {
          from = to;
          to = from + value.length;
          buf = buf.write(Type.StructFieldValue, from, to);
          const expression = line.text.slice(line.pos + from, line.pos + to);
          buf = parseExpression(buf, expression, from, to);
        }
        if (valueSpace) {
          from = to;
          to = from + valueSpace.length;
        }
        if (operator) {
          from = to;
          to = from + operator.length;
          buf = buf.write(Type.StructOperator, from, to);
        }
        if (operatorSpace) {
          from = to;
          to = from + operatorSpace.length;
        }
        from = to;
        to = line.text.length - line.pos;
        if (to > from) {
          buf = buf.write(Type.Comment, from, to);
        }
        const node = buf.finish(Type.StructField, line.text.length - line.pos);
        cx.addNode(node, cx.lineStart + line.pos);
        cx.nextLine();
        return true;
      }
      return false;
    }
    const valueFieldMatch = isStructValueField(line);
    if (valueFieldMatch) {
      const name = valueFieldMatch[2] || "";
      const nameSpace = valueFieldMatch[3] || "";
      const operator = valueFieldMatch[4] || "";
      const operatorSpace = valueFieldMatch[5] || "";
      const value = valueFieldMatch[6] || "";
      if (name) {
        from = to;
        to = from + name.length;
        buf = buf.write(Type.StructFieldName, from, to);
      }
      if (nameSpace) {
        from = to;
        to = from + nameSpace.length;
      }
      if (operator) {
        from = to;
        to = from + operator.length;
        buf = buf.write(Type.StructOperator, from, to);
      }
      if (operatorSpace) {
        from = to;
        to = from + operatorSpace.length;
      }
      if (value) {
        from = to;
        to = from + value.length;
        buf = buf.write(Type.StructFieldValue, from, to);
        const expression = line.text.slice(line.pos + from, line.pos + to);
        buf = parseExpression(buf, expression, from, to);
      }
      from = to;
      to = line.text.length - line.pos;
      if (to > from) {
        buf = buf.write(Type.Comment, from, to);
      }
      const node = buf.finish(Type.StructField, line.text.length - line.pos);
      cx.addNode(node, cx.lineStart + line.pos);
      cx.nextLine();
      return true;
    }
    const objectFieldMatch = isStructObjectField(line);
    if (objectFieldMatch) {
      const name = objectFieldMatch[2] || "";
      const nameSpace = objectFieldMatch[3] || "";
      const colon = objectFieldMatch[4] || "";
      if (name) {
        from = to;
        to = from + name.length;
        buf = buf.write(Type.StructFieldName, from, to);
      }
      if (nameSpace) {
        from = to;
        to = from + nameSpace.length;
      }
      if (colon) {
        from = to;
        to = from + name.length;
        buf = buf.write(Type.StructColon, from, to);
      }
      const node = buf.finish(Type.StructField, line.text.length - line.pos);
      cx.addNode(node, cx.lineStart + line.pos);
      cx.nextLine();
      return true;
    }
    return false;
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

  SectionHeading(cx, line) {
    const match = isSectionHeading(line);
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
    const parameters = match[6] || "";
    const colon = match[7] || "";
    const colonSpace = match[8] || "";
    const returnType = match[9] || "";
    const returnTypeSpace = match[10] || "";
    const level = mark.length;

    if (level <= 0 || !markSpace) {
      let buf = cx.buffer;
      buf = buf.write(Type.PossibleSectionMark, 0, mark.length);
      from = to;
      to = line.text.length - line.pos;
      if (to > from) {
        buf = buf.write(Type.Comment, from, to);
      }
      const node = buf.finish(
        Type.PossibleSection,
        line.text.length - line.pos
      );
      cx.addNode(node, cx.lineStart + line.pos);
      cx.nextLine();
      return true;
    }

    cx.startContext(Type.Section, 0, level);

    if (mark || markSpace) {
      from = to;
      to = from + mark.length + markSpace.length;
      buf = buf.write(Type.SectionMark, from, to);
    }
    if (name || nameSpace) {
      from = to;
      to = from + name.length + nameSpace.length;
      buf = buf.write(Type.SectionName, from, to);
    }
    if (parameters) {
      const hasOpenMark = parameters[0] === "(" || parameters[0] === "[";
      const expectedCloseMark =
        parameters[0] === "(" ? ")" : parameters[0] === "[" ? "]" : "";
      const closeIndex = expectedCloseMark
        ? parameters.lastIndexOf(expectedCloseMark)
        : -1;
      const hasCloseMark = closeIndex >= 0;
      const values =
        hasOpenMark && hasCloseMark
          ? parameters.slice(1, closeIndex)
          : hasOpenMark
          ? parameters.slice(1)
          : hasCloseMark
          ? parameters.slice(0, closeIndex)
          : parameters;
      const openMark = hasOpenMark ? parameters[0] : "";
      const closeMark = hasCloseMark ? parameters[closeIndex] : "";
      if (openMark) {
        from = to;
        to = from + openMark.length;
        buf = buf.write(Type.SectionOpenMark, from, to);
      }
      const expressionListMatches = Array.from(
        values.matchAll(sparkRegexes.expression_list)
      );
      const tokenMatches: string[] = [""];
      expressionListMatches.forEach((m) => {
        const text = m[0];
        const separatorGroupMatch = m[2];
        if (separatorGroupMatch) {
          tokenMatches.push("");
          tokenMatches[tokenMatches.length - 1] += text;
          tokenMatches.push("");
        } else {
          tokenMatches[tokenMatches.length - 1] += text;
        }
      });
      if (tokenMatches) {
        const start = 0;
        const end = tokenMatches.length;
        for (let i = start; i < end; i += 1) {
          const token = tokenMatches[i];
          from = to;
          to = from + token.length;
          let parameterMatch: RegExpMatchArray;
          if (token === ",") {
            buf = buf.write(Type.SectionSeparatorMark, from, to);
          } else if (!token.trim()) {
            // empty
          } else if (
            (parameterMatch = token.match(sparkRegexes.parameter_declaration))
          ) {
            const name = parameterMatch[2] || "";
            const nameSpace = parameterMatch[3] || "";
            const colon = parameterMatch[4] || "";
            const colonSpace = parameterMatch[5] || "";
            const type = parameterMatch[6] || "";
            const typeSpace = parameterMatch[7] || "";
            const operator = parameterMatch[8] || "";
            const operatorSpace = parameterMatch[9] || "";
            const value = parameterMatch[10] || "";
            const valueSpace = parameterMatch[11] || "";

            if (name || nameSpace) {
              to = from + name.length + nameSpace.length;
              buf = buf.write(
                openMark === "["
                  ? Type.SectionVariableName
                  : Type.SectionParameterName,
                from,
                to
              );
            }
            if (colon || colonSpace) {
              from = to;
              to = from + colon.length + colonSpace.length;
              buf = buf.write(Type.SectionParameterColon, from, to);
            }
            if (type || typeSpace) {
              from = to;
              to = from + type.length + typeSpace.length;
              buf = buf.write(Type.SectionParameterType, from, to);
            }
            if (operator || operatorSpace) {
              from = to;
              to = from + operator.length + operatorSpace.length;
              buf = buf.write(Type.SectionParameterOperator, from, to);
            }
            if (value || valueSpace) {
              from = to;
              to = from + value.length + valueSpace.length;
              buf = buf.write(Type.SectionParameterValue, from, to);
              const expression = line.text.slice(
                line.pos + from,
                line.pos + to
              );
              buf = parseExpression(buf, expression, from, to);
            }
          }
        }
        const parametersSpaceLength =
          parameters.length - parameters.trimEnd().length;
        to += parametersSpaceLength;
      }
      if (closeMark) {
        from = to;
        to = from + closeMark.length;
        buf = buf.write(Type.SectionCloseMark, from, to);
      }
    }
    if (colon || colonSpace) {
      from = to;
      to = from + colon.length + colonSpace.length;
      buf = buf.write(Type.SectionColonMark, from, to);
    }
    if (returnType || returnTypeSpace) {
      from = to;
      to = from + returnType.length + returnTypeSpace.length;
      buf = buf.write(Type.SectionReturnType, from, to);
    }
    from = to;
    to = line.text.length - line.pos;
    if (to > from) {
      buf = buf.write(Type.Comment, from, to);
    }
    const node = buf.finish(Type.Section, line.text.length - line.pos);
    cx.addNode(node, cx.lineStart + line.pos);
    cx.nextLine();
    return true;
  },

  Synopsis(cx, line) {
    const match = isSynopsis(line);
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
      buf = buf.write(Type.SynopsisMark, from, to);
    }
    from = to;
    to = line.text.length - line.pos;
    if (to > from) {
      buf = buf.write(Type.Comment, from, to);
    }
    const node = buf.finish(Type.Synopsis, line.text.length - line.pos);
    cx.addNode(node, cx.lineStart + line.pos);
    cx.nextLine();
    return true;
  },

  Jump(cx, line) {
    const match = isJump(line);
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
    const parameters = match[6] || "";
    const parametersSpace = match[7] || "";

    if (mark || markSpace) {
      from = to;
      to = from + mark.length + markSpace.length;
      buf = buf.write(Type.JumpMark, from, to);
    }
    if (sectionName || sectionNameSpace) {
      from = to;
      to = from + sectionName.length + sectionNameSpace.length;
      buf = buf.write(Type.JumpSectionName, from, to);
    }
    if (parameters || parametersSpace) {
      const hasOpenMark =
        parameters.startsWith("(") || parameters.startsWith("[");
      const hasCloseMark = parameters.endsWith(")") || parameters.endsWith("]");
      const values =
        hasOpenMark && hasCloseMark
          ? parameters.slice(1, -1)
          : hasOpenMark
          ? parameters.slice(1)
          : hasCloseMark
          ? parameters.slice(0, -1)
          : parameters;
      const openMark = hasOpenMark ? parameters.slice(0, 1) : "";
      const closeMark = hasCloseMark ? parameters.slice(-1) : "";
      if (openMark) {
        from = to;
        to = from + openMark.length;
        buf = buf.write(Type.JumpOpenMark, from, to);
      }
      const expressionListMatches = Array.from(
        values.matchAll(sparkRegexes.expression_list)
      );
      const tokenMatches: string[] = [""];
      expressionListMatches.forEach((m) => {
        const text = m[0];
        const separatorGroupMatch = m[2];
        if (separatorGroupMatch) {
          tokenMatches.push("");
          tokenMatches[tokenMatches.length - 1] += text;
          tokenMatches.push("");
        } else {
          tokenMatches[tokenMatches.length - 1] += text;
        }
      });
      if (tokenMatches) {
        const start = 0;
        const end = tokenMatches.length;
        for (let i = start; i < end; i += 1) {
          const token = tokenMatches[i];
          from = to;
          to = from + token.length;
          if (i === tokenMatches.length - 1) {
            to += parametersSpace.length;
          }
          if (token === ",") {
            buf = buf.write(Type.JumpSeparatorMark, from, to);
          } else {
            buf = buf.write(Type.JumpValue, from, to);
            const expression = line.text.slice(line.pos + from, line.pos + to);
            buf = parseExpression(buf, expression, from, to);
          }
        }
      }
      if (closeMark) {
        from = to;
        to = from + closeMark.length;
        buf = buf.write(Type.JumpCloseMark, from, to);
      }
    }
    from = to;
    to = line.text.length - line.pos;
    if (to > from) {
      buf = buf.write(Type.Comment, from, to);
    }
    const node = buf.finish(Type.Jump, line.text.length - line.pos);
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
      const expression = line.text.slice(line.pos + from, line.pos + to);
      buf = parseExpression(buf, expression, from, to);
    }
    from = to;
    to = line.text.length - line.pos;
    if (to > from) {
      buf = buf.write(Type.Comment, from, to);
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
    from = to;
    to = line.text.length - line.pos;
    if (to > from) {
      buf = buf.write(Type.Comment, from, to);
    }
    const node = buf.finish(Type.Repeat, line.text.length - line.pos);
    cx.addNode(node, cx.lineStart + line.pos);
    cx.nextLine();
    return true;
  },

  Import(cx, line) {
    const match = isImport(line);
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
      buf = buf.write(Type.ImportMark, from, to);
    }
    if (value || valueSpace) {
      from = to;
      to = from + value.length + valueSpace.length;
      buf = buf.write(Type.ImportValue, from, to);
      const expression = line.text.slice(line.pos + from, line.pos + to);
      buf = parseExpression(buf, expression, from, to);
    }
    from = to;
    to = line.text.length - line.pos;
    if (to > from) {
      buf = buf.write(Type.Comment, from, to);
    }
    const node = buf.finish(Type.Import, line.text.length - line.pos);
    cx.addNode(node, cx.lineStart + line.pos);
    cx.nextLine();
    return true;
  },

  Transition(cx, line) {
    const match = isTransition(line);
    if (!match) {
      return false;
    }

    let buf = cx.buffer;
    let from = 0;
    let to = from;

    const content = match[2] || "";
    const contentSpace = match[3] || "";

    cx.startContext(Type.Display, line.basePos, line.next);

    if (content) {
      from = to;
      to = from + content.length;
      buf = buf.writeElements(cx.parser.parseInline(content, from, cx));
    }
    if (contentSpace) {
      from = to;
      to = from;
      for (let i = 0; i < contentSpace.length; i += 1) {
        from = to;
        to = from + 1;
        buf = buf.write(Type.Pause, from, to);
      }
    }
    from = to;
    to = line.text.length - line.pos;
    if (to > from) {
      buf = buf.write(Type.Comment, from, to);
    }
    const node = buf.finish(Type.Transition, line.text.length - line.pos);
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
    const location = match[3] || "";
    const locationSpace = match[4] || "";
    const separator = match[5] || "";
    const separatorSpace = match[6] || "";
    const time = match[7] || "";
    const timeSpace = match[8] || "";
    const numberOpenMark = match[9] || "";
    const number = match[10] || "";
    const numberCloseMark = match[11] || "";
    const numberCloseMarkSpace = match[12] || "";

    cx.startContext(Type.Display, line.basePos, line.next);

    if (prefix) {
      if (prefix.startsWith(".")) {
        from = to;
        to = from + 1;
        buf = buf.write(Type.SceneMark, from, to);
        from = to;
        to = from + prefix.length - 1;
        buf = buf.write(Type.ScenePrefix, from, to);
      } else {
        from = to;
        to = from + prefix.length;
        buf = buf.write(Type.ScenePrefix, from, to);
      }
    }
    if (location) {
      from = to;
      to = from + location.length;
      buf = buf.write(Type.SceneLocation, from, to);
    }
    if (locationSpace) {
      from = to;
      to = from + locationSpace.length;
      if (!match.slice(6).join("")) {
        to = from;
        for (let i = 0; i < locationSpace.length; i += 1) {
          from = to;
          to = from + 1;
          buf = buf.write(Type.Pause, from, to);
        }
      }
    }
    if (separator) {
      from = to;
      to = from + separator.length;
      buf = buf.write(Type.SceneSeparatorMark, from, to);
    }
    if (separatorSpace) {
      from = to;
      to = from + separatorSpace.length;
      if (!match.slice(8).join("")) {
        to = from;
        for (let i = 0; i < separatorSpace.length; i += 1) {
          from = to;
          to = from + 1;
          buf = buf.write(Type.Pause, from, to);
        }
      }
    }
    if (time) {
      from = to;
      to = from + time.length;
      buf = buf.write(Type.SceneTime, from, to);
    }
    if (timeSpace) {
      from = to;
      to = from + timeSpace.length;
      if (!match.slice(10).join("")) {
        to = from;
        for (let i = 0; i < timeSpace.length; i += 1) {
          from = to;
          to = from + 1;
          buf = buf.write(Type.Pause, from, to);
        }
      }
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
    if (numberCloseMarkSpace) {
      from = to;
      to = from;
      for (let i = 0; i < numberCloseMarkSpace.length; i += 1) {
        from = to;
        to = from + 1;
        buf = buf.write(Type.Pause, from, to);
      }
    }
    from = to;
    to = line.text.length - line.pos;
    if (to > from) {
      buf = buf.write(Type.Comment, from, to);
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

    cx.startContext(Type.Display, line.basePos, line.next);

    if (openMark || openMarkSpace) {
      from = to;
      to = from + openMark.length + openMarkSpace.length;
      buf = buf.write(Type.CenteredMark, from, to);
    }
    if (content || contentSpace) {
      from = to;
      to = from + content.length + contentSpace.length;
      buf = buf.writeElements(cx.parser.parseInline(content, from, cx));
    }
    if (closeMark) {
      from = to;
      to = from + closeMark.length;
      buf = buf.write(Type.CenteredMark, from, to);
    }
    if (closeMarkSpace) {
      from = to;
      to = from;
      for (let i = 0; i < closeMarkSpace.length; i += 1) {
        from = to;
        to = from + 1;
        buf = buf.write(Type.Pause, from, to);
      }
    }
    from = to;
    to = line.text.length - line.pos;
    if (to > from) {
      buf = buf.write(Type.Comment, from, to);
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

    if (cx.block.type !== Type.BulletList) {
      cx.startContext(Type.BulletList, line.basePos, line.next);
    }
    const newBase = getListIndent(line, line.pos + 1);
    cx.startContext(Type.ListItem, line.basePos, newBase - line.baseIndent);

    let buf = cx.buffer;

    let from = 0;
    let to = from;
    let node: Tree;

    const match =
      isChoice(line) ||
      isCondition(line) ||
      isVariable(line) ||
      isCall(line) ||
      isAssign(line);

    if (!match) {
      from = to;
      to = line.text.length - line.pos;
      if (to > from) {
        buf = buf.write(Type.Comment, from, to);
      }
      node = buf.finish(Type.PossibleLogic, line.text.length - line.pos);
      cx.addNode(node, cx.lineStart + line.pos);
      cx.nextLine();
      return true;
    }

    if (match?.[0] === "variable") {
      const mark = match[2] || "";
      const markSpace = match[3] || "";
      const keyword = match[4] || "";
      const keywordSpace = match[5] || "";
      const name = match[6] || "";
      const nameSpace = match[7] || "";
      const colon = match[8] || "";
      const colonSpace = match[9] || "";
      const type = match[10] || "";
      const typeSpace = match[11] || "";
      const operator = match[12] || "";
      const operatorSpace = match[13] || "";
      const value = match[14] || "";
      const valueSpace = match[15] || "";

      if (mark || markSpace) {
        from = to;
        to = from + mark.length + markSpace.length;
        buf = buf.write(Type.VariableMark, from, to);
      }
      if (keyword || keywordSpace) {
        from = to;
        to = from + keyword.length + keywordSpace.length;
        buf = buf.write(Type.VariableKeyword, from, to);
      }
      if (name || nameSpace) {
        from = to;
        to = from + name.length + nameSpace.length;
        buf = buf.write(Type.VariableName, from, to);
      }
      if (colon || colonSpace) {
        from = to;
        to = from + colon.length + colonSpace.length;
        buf = buf.write(Type.VariableColon, from, to);
      }
      if (type || typeSpace) {
        from = to;
        to = from + type.length + typeSpace.length;
        buf = buf.write(Type.VariableType, from, to);
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
        const expression = line.text.slice(line.pos + from, line.pos + to);
        buf = parseExpression(buf, expression, from, to);
      }
      from = to;
      to = line.text.length - line.pos;
      if (to > from) {
        buf = buf.write(Type.Comment, from, to);
      }
      node = buf.finish(Type.Assign, line.text.length - line.pos);
    } else if (match?.[0] === "assign") {
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
        const expression = line.text.slice(line.pos + from, line.pos + to);
        buf = parseExpression(buf, expression, from, to);
      }
      from = to;
      to = line.text.length - line.pos;
      if (to > from) {
        buf = buf.write(Type.Comment, from, to);
      }
      node = buf.finish(Type.Assign, line.text.length - line.pos);
    } else if (match?.[0] === "condition") {
      const mark = match[2] || "";
      const markSpace = match[3] || "";
      const check = match[4] || "";
      const checkSpace = match[5] || "";
      const value = match[6] || "";
      const valueSpace = match[7] || "";
      const colon = match[8] || "";
      const colonSpace = match[9] || "";

      if (mark || markSpace) {
        from = to;
        to = from + mark.length + markSpace.length;
        buf = buf.write(Type.ConditionMark, from, to);
      }
      if (check || checkSpace) {
        from = to;
        to = from + check.length + checkSpace.length;
        buf = buf.write(Type.ConditionCheck, from, to);
      }
      if (value || valueSpace) {
        from = to;
        to = from + value.length + valueSpace.length;
        buf = buf.write(Type.ConditionValue, from, to);
        const expression = line.text.slice(line.pos + from, line.pos + to);
        buf = parseExpression(buf, expression, from, to);
      }
      if (colon || colonSpace) {
        from = to;
        to = from + colon.length + colonSpace.length;
        buf = buf.write(Type.ConditionColonMark, from, to);
      }
      from = to;
      to = line.text.length - line.pos;
      if (to > from) {
        buf = buf.write(Type.Comment, from, to);
      }
      node = buf.finish(Type.Condition, line.text.length - line.pos);
    } else if (match?.[0] === "call") {
      const mark = match[2] || "";
      const markSpace = match[3] || "";
      const name = match[4] || "";
      const nameSpace = match[5] || "";
      const parameters = match[6] || "";
      const parametersSpace = match[7] || "";

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
      if (parameters || parametersSpace) {
        const hasOpenMark =
          parameters.startsWith("(") || parameters.startsWith("[");
        const hasCloseMark =
          parameters.endsWith(")") || parameters.endsWith("]");
        const values =
          hasOpenMark && hasCloseMark
            ? parameters.slice(1, -1)
            : hasOpenMark
            ? parameters.slice(1)
            : hasCloseMark
            ? parameters.slice(0, -1)
            : parameters;
        const openMark = hasOpenMark ? parameters.slice(0, 1) : "";
        const closeMark = hasCloseMark ? parameters.slice(-1) : "";
        if (openMark) {
          from = to;
          to = from + openMark.length;
          buf = buf.write(Type.CallOpenMark, from, to);
        }
        const expressionListMatches = Array.from(
          values.matchAll(sparkRegexes.expression_list)
        );
        const tokenMatches: string[] = [""];
        expressionListMatches.forEach((m) => {
          const text = m[0];
          const separatorGroupMatch = m[2];
          if (separatorGroupMatch) {
            tokenMatches.push("");
            tokenMatches[tokenMatches.length - 1] += text;
            tokenMatches.push("");
          } else {
            tokenMatches[tokenMatches.length - 1] += text;
          }
        });
        if (tokenMatches) {
          const start = 0;
          const end = tokenMatches.length;
          let paramIndex = 0;
          for (let i = start; i < end; i += 1) {
            const token = tokenMatches[i];
            from = to;
            to = from + token.length;
            if (i === tokenMatches.length - 1) {
              to += parametersSpace.length;
            }
            if (token === ",") {
              buf = buf.write(Type.CallSeparatorMark, from, to);
            } else if (
              entityMethods.includes(name as MethodType) &&
              paramIndex === 0
            ) {
              buf = buf.write(Type.CallEntityName, from, to);
              paramIndex += 1;
            } else {
              buf = buf.write(Type.CallValue, from, to);
              paramIndex += 1;
              const expression = line.text.slice(
                line.pos + from,
                line.pos + to
              );
              buf = parseExpression(buf, expression, from, to);
            }
          }
        }
        if (closeMark) {
          from = to;
          to = from + closeMark.length;
          buf = buf.write(Type.CallCloseMark, from, to);
        }
      }
      from = to;
      to = line.text.length - line.pos;
      if (to > from) {
        buf = buf.write(Type.Comment, from, to);
      }
      node = buf.finish(Type.Call, line.text.length - line.pos);
    } else if (match?.[0] === "choice") {
      const mark = match[2] || "";
      const markSpace = match[3] || "";
      const content = match[4] || "";
      const contentSpace = match[5] || "";
      const angle = match[6] || "";
      const angleSpace = match[7] || "";
      const section = match[8] || "";
      const sectionSpace = match[9] || "";

      if (mark || markSpace) {
        from = to;
        to = from + mark.length + markSpace.length;
        buf = buf.write(Type.ChoiceMark, from, to);
      }
      if (content || contentSpace) {
        from = to;
        to = from + content.length + contentSpace.length;
        buf = buf.writeElements(cx.parser.parseInline(content, from, cx));
      }
      if (angle || angleSpace) {
        from = to;
        to = from + angle.length + angleSpace.length;
        buf = buf.write(Type.ChoiceGoMark, from, to);
      }
      if (section || sectionSpace) {
        from = to;
        to = from + section.length + sectionSpace.length;
        buf = buf.write(Type.ChoiceSectionName, from, to);
      }
      from = to;
      to = line.text.length - line.pos;
      if (to > from) {
        buf = buf.write(Type.Comment, from, to);
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

    const character = match[2] || "";
    const characterSpace = match[3] || "";
    const parenthetical = match[4] || "";
    const parentheticalSpace = match[5] || "";
    const dual = match[6] || "";

    const firstCharacterNextLine = cx.input.read(
      cx.lineStart + line.pos + line.text.length + 1,
      cx.lineStart + line.pos + line.text.length + 2
    );

    let buf = cx.buffer;
    let from = 0;
    let to = from;

    if (!character.startsWith("@") && !firstCharacterNextLine.trim()) {
      from = to;
      to = from + character.length;
      buf = buf.write(Type.PossibleCharacterName, from, to);
      from = to;
      to = line.text.length - line.pos;
      if (to > from) {
        buf = buf.write(Type.Comment, from, to);
      }
      const node = buf.finish(
        Type.PossibleCharacter,
        line.text.length - line.pos
      );
      cx.addNode(node, cx.lineStart + line.pos);
      cx.nextLine();
      return true;
    }

    cx.startContext(Type.Display, line.basePos, line.next);
    cx.startContext(Type.Dialogue, line.basePos, line.next);

    let characterName = character;
    if (characterName.startsWith("@")) {
      from = to;
      to = from + 1;
      buf = buf.write(Type.CharacterMark, from, to);
      characterName = characterName.slice(1);
    }
    if (characterName) {
      from = to;
      to = from + characterName.length;
      buf = buf.write(Type.CharacterName, from, to);
    }
    if (characterSpace) {
      from = to;
      to = from + characterSpace.length;
    }
    if (parenthetical) {
      from = to;
      to = from + parenthetical.length;
      buf.write(Type.CharacterParenthetical, from, to);
    }
    if (parentheticalSpace) {
      from = to;
      to = from + parentheticalSpace.length;
    }
    if (dual) {
      from = to;
      to = from + dual.length;
      buf.write(Type.CharacterDual, from, to);
    }
    from = to;
    to = line.text.length - line.pos;
    if (to > from) {
      buf = buf.write(Type.Comment, from, to);
    }
    const node = buf.finish(Type.Character, line.text.length - line.pos);
    cx.addNode(node, cx.lineStart + line.pos);
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

    let buf = cx.buffer;
    let from = 0;
    let to = from;

    const mark = match[2] || "";
    const content = match[3] || "";

    if (mark) {
      from = to;
      to = from + mark.length;
      buf = buf.write(Type.LyricMark, from, to);
    }
    if (content) {
      from = to;
      to = from + content.length;
      buf = buf.writeElements(cx.parser.parseInline(content, from, cx));
    }
    const node = buf.finish(Type.Lyric, line.text.length - line.pos);
    cx.addNode(node, cx.lineStart + line.pos);
    cx.nextLine();
    return true;
  },

  Dialogue(cx, line) {
    if (!inBlockContext(cx, Type.Dialogue)) {
      return false;
    }

    let buf = cx.buffer;
    let from = 0;
    let to = from;

    const content = line.text;

    if (content) {
      from = to;
      to = from + line.text.length;
      buf = buf.writeElements(cx.parser.parseInline(content, from, cx));
    }
    const node = buf.finish(Type.DialogueLine, content.length - line.pos);
    cx.addNode(node, cx.lineStart + line.pos);
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
  Action(cx, line) {
    cx.startContext(Type.Display, line.basePos, line.next);

    return false;
  },
};
