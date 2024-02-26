import { SparkToken } from "../../../sparkdown/src";
import { PrintProfile } from "../types/PrintProfile";
import { TextOptions } from "../types/TextOptions";

const SINGLE_MARKERS = ["|", "*", "_", "^", "=", ">", "<"];
const DOUBLE_MARKERS = ["~~", "::"];

export interface TypesetterConfig {
  screenplay_print_chunks?: boolean;
  screenplay_print_sections?: boolean;
  screenplay_print_dialogue_contd?: string;
  screenplay_print_dialogue_more?: string;
  screenplay_print_dialogue_split_across_pages?: boolean;
}

export interface DocumentLine {
  tag: string;

  line: number;
  from: number;
  to: number;

  column?: string;
  align?: "left" | "right" | "center";

  scene?: string | number;
  level?: number;

  content?: DocumentText[];

  sceneSplit?: boolean;
  leftColumn?: DocumentLine[];
  rightColumn?: DocumentLine[];
}

export interface DocumentText extends TextOptions {
  text: string;
}

export class Typesetter {
  layout(
    tokens: SparkToken[],
    print: PrintProfile,
    config: TypesetterConfig
  ): DocumentLine[] {
    let lines: DocumentLine[] = [];

    const pushSeparator = () => {
      const lastLine = lines.at(-1);
      if (lastLine && lastLine.tag !== "separator") {
        lines.push({
          tag: "separator",
          line: lastLine.line,
          from: lastLine.to + 1,
          to: lastLine.to + 1,
        });
      }
    };

    tokens.forEach((t: SparkToken) => {
      if (t.tag === "flow_break") {
        lines.push({
          tag: "page_break",
          line: t.line,
          from: t.from,
          to: t.to,
        });
      } else if (t.tag === "chunk") {
        const max = print[t.tag]?.max ?? print.action.max;
        lines.push(
          ...this.formatLine(
            t.tag,
            t.name,
            max,
            t.line,
            t.from,
            print[t.tag]?.align
          )
        );
        if (config.screenplay_print_chunks) {
          pushSeparator();
        }
      } else if (t.tag === "section") {
        const max = print[t.tag]?.max ?? print.action.max;
        lines.push(
          ...this.formatLine(
            t.tag,
            t.name,
            max,
            t.line,
            t.from,
            print[t.tag]?.align
          )
        );
        if (config.screenplay_print_sections) {
          pushSeparator();
        }
      } else if (t.tag === "scene") {
        const sceneLines: DocumentLine[] = [];
        const max = print[t.tag]?.max ?? print.action.max;
        if (t.content) {
          t.content.forEach((c) => {
            if (c.text != undefined) {
              sceneLines.push(
                ...this.formatLine(
                  t.tag,
                  c.text,
                  max,
                  c.line,
                  c.from,
                  print[t.tag]?.align
                )
              );
            }
          });
        }
        if (sceneLines[0]) {
          sceneLines[0].scene = t.index;
        }
        lines.push(...sceneLines);
        pushSeparator();
      } else if (t.tag === "transition") {
        const transitionLines: DocumentLine[] = [];
        const max = print[t.tag]?.max ?? print.action.max;
        if (t.content) {
          t.content.forEach((c) => {
            if (c.text != undefined) {
              transitionLines.push(
                ...this.formatLine(
                  t.tag,
                  c.text,
                  max,
                  c.line,
                  c.from,
                  print[t.tag]?.align
                )
              );
            }
          });
        }
        lines.push(...transitionLines);
        pushSeparator();
      } else if (t.tag === "action") {
        const actionLines: DocumentLine[] = [];
        const max = print[t.tag]?.max ?? print.action.max;
        t.content?.forEach((box) => {
          box.content?.forEach((c) => {
            if (c.text != undefined) {
              actionLines.push(
                ...this.formatLine(
                  t.tag,
                  c.text,
                  max,
                  c.line,
                  c.from,
                  print[t.tag]?.align
                )
              );
            }
          });
        });
        lines.push(...actionLines);
        pushSeparator();
      } else if (t.tag === "dialogue") {
        const column = t.content?.[0]?.position;
        const dialogueLines: DocumentLine[] = [];
        if (t.characterName?.text || t.characterParenthetical?.text) {
          const tag = "dialogue_character_name";
          const max = print[tag]?.max ?? print.dialogue.max;
          const dualMax = max * print.dual_max_factor;
          const dialogueMax = column ? dualMax : max;
          const text =
            (t.characterName?.text || "") +
            (t.characterParenthetical?.text
              ? " " + t.characterParenthetical.text
              : "");
          const line =
            t.characterName?.line ?? t.characterParenthetical?.line ?? t.line;
          const from =
            t.characterName?.from ?? t.characterParenthetical?.from ?? t.from;
          if (text) {
            dialogueLines.push(
              ...this.formatLine(
                tag,
                text,
                dialogueMax,
                line,
                from,
                print[tag]?.align
              )
            );
          }
        }
        t.content?.forEach((box) => {
          box.content?.forEach((c) => {
            if (c.text != null) {
              if (c.tag === "dialogue_line_parenthetical") {
                const tag = c.tag;
                const max = print[tag]?.max ?? print.dialogue.max;
                const dualMax = max * print.dual_max_factor;
                const dialogueMax = column ? dualMax : max;
                dialogueLines.push(
                  ...this.formatLine(
                    tag,
                    c.text,
                    dialogueMax,
                    c.line,
                    c.from,
                    print[tag]?.align
                  )
                );
              } else if (c.tag === "text") {
                const tag = "dialogue";
                const max = print[tag]?.max ?? print.dialogue.max;
                const dualMax = max * print.dual_max_factor;
                const dialogueMax = column ? dualMax : max;
                dialogueLines.push(
                  ...this.formatLine(
                    tag,
                    c.text,
                    dialogueMax,
                    c.line,
                    c.from,
                    print[tag]?.align
                  )
                );
              }
            }
          });
        });
        if (column === "left") {
          lines.push({
            leftColumn: dialogueLines,
          });
        } else if (column === "right") {
          const prevLine = lines.at(-1);
          if (prevLine) {
            prevLine.rightColumn = dialogueLines;
          }
          pushSeparator();
        } else {
          lines.push(...dialogueLines);
          pushSeparator();
        }
      }
    });

    // TODO: handle page breaks
    // lines = this.breakLines(lines, this.breaker, print, config);

    return lines;
  }

  protected formatLine(
    tag: string,
    text: string,
    max: number,
    line: number,
    from: number,
    align?: string,
    column?: string
  ): DocumentLine[] {
    const trimmed = text.replace(/[\n\r]+$/, "");
    const content = this.style(trimmed, align);
    return this.textWrap(tag, content, max, line, from, column);
  }

  protected style(text: string, align?: string): DocumentText[] {
    let escaped = false;
    const marks: [string, number][] = [];
    const chars = text.replace("\t", "    ");
    const textChunks: DocumentText[] = [];
    for (let i = 0; i < chars.length; ) {
      const char = chars[i] || "";
      const nextChar = chars[i + 1] || "";
      const lastMark = marks[marks.length - 1]?.[0];
      if (!escaped) {
        if (char === "\\") {
          // escape char
          i += 1;
          escaped = true;
          continue;
        }
        if (
          SINGLE_MARKERS.includes(char) ||
          DOUBLE_MARKERS.includes(char + nextChar)
        ) {
          let mark = "";
          let m = i;
          while (chars[m] === char) {
            mark += chars[m];
            m += 1;
          }
          if (lastMark === mark) {
            marks.pop();
          } else {
            marks.push([mark, textChunks.length - 1]);
          }
          i += mark.length;
          continue;
        }
      }
      escaped = false;
      const markers = marks.map(([mark]) => mark);
      const activeCenteredMark = markers.find((m) => m.startsWith("|"));
      const activeBoldItalicMark = markers.find((m) => m.startsWith("***"));
      const activeUnderlineMark = markers.find((m) => m.startsWith("_"));
      const isCentered = Boolean(activeCenteredMark);
      const hasBoldItalicMark = Boolean(activeBoldItalicMark);
      const isUnderlined = Boolean(activeUnderlineMark);
      const hasBoldMark = markers.includes("**");
      const hasItalicMark = markers.includes("*");
      const isItalicized = hasBoldItalicMark || hasItalicMark;
      const isBolded = hasBoldItalicMark || hasBoldMark;

      const chunk: DocumentText = { text: char };
      if (isBolded) {
        chunk.bold = true;
      }
      if (isItalicized) {
        chunk.italic = true;
      }
      if (isUnderlined) {
        chunk.underline = true;
      }
      if (isCentered) {
        chunk.align = "center";
      } else if (align) {
        chunk.align = align;
      }
      textChunks.push(chunk);
      i += 1;
    }
    return textChunks;
  }

  protected wrapChars(
    tag: string,
    styledChars: DocumentText[],
    max: number,
    line: number,
    from: number,
    column?: string
  ): DocumentLine[] {
    if (styledChars.length <= max) {
      return [
        {
          tag,
          content: styledChars,
          line,
          from,
          to: from + styledChars.length - 1,
          column,
        },
      ];
    }

    let wrapAt = styledChars
      .slice(0, max + 1)
      .findLastIndex((c) => c.text === " ");
    if (wrapAt < 0) {
      // Break line at max
      wrapAt = max - 1;
    } else {
      // Break line at after space closest to max
      for (let i = wrapAt; i < styledChars.length; i += 1) {
        const c = styledChars[i];
        if (c?.text !== " ") {
          break;
        }
        wrapAt = i;
      }
    }

    return [
      {
        tag,
        content: styledChars.slice(0, wrapAt),
        line,
        from,
        to: from + wrapAt,
        column,
      },
      ...this.textWrap(
        tag,
        styledChars.slice(wrapAt + 1),
        max,
        line,
        from + wrapAt,
        column
      ),
    ];
  }

  protected textWrap(
    tag: string,
    styledChars: DocumentText[],
    max: number,
    line: number,
    from: number,
    column?: string
  ): DocumentLine[] {
    const wrappedLines = this.wrapChars(
      tag,
      styledChars,
      max,
      line,
      from,
      column
    );
    wrappedLines.forEach((line) => {
      const consolidatedContent: DocumentText[] = [];
      line.content?.forEach((c) => {
        const prev = consolidatedContent.at(-1);
        if (
          prev &&
          c.bold === prev.bold &&
          c.italic === prev.italic &&
          c.underline === prev.underline &&
          c.align === prev.align &&
          c.color === prev.color &&
          c.highlight === prev.highlight &&
          c.highlightColor === prev.highlightColor
        ) {
          // Combine consecutive chunks that have the same style.
          prev.text += c.text;
        } else {
          consolidatedContent.push(c);
        }
      });
      line.content = consolidatedContent;
    });
    return wrappedLines;
  }

  protected breakLines(
    lines: DocumentLine[],
    breaker: (
      index: number,
      lines: DocumentLine[],
      config: TypesetterConfig
    ) => boolean,
    print: PrintProfile,
    config: TypesetterConfig
  ): DocumentLine[] {
    while (lines.length && !lines[0]?.text) {
      lines.shift();
    }

    const maxLines = print.lines_per_page;

    let s = maxLines;
    let p;
    let internalBreak = 0;

    for (let i = 0; i < lines.length && i < maxLines; i++) {
      if (lines[i]?.tag === "page_break") {
        internalBreak = i;
      }
    }

    if (!internalBreak) {
      if (lines.length <= maxLines) {
        return lines;
      }
      do {
        for (p = s - 1; p && !lines[p]?.text; p--) {
          // loop
        }
        s = p;
      } while (p && !breaker(p, lines, config));
      if (!p) {
        p = maxLines;
      }
    } else {
      p = internalBreak - 1;
    }
    const page = lines.slice(0, p + 1);

    // if scene is not finished (next not empty token is not a heading) - add (CONTINUED)
    let nextPageLineIndex = p + 1;
    let nextPageLine = null;
    let sceneSplit = false;
    while (nextPageLineIndex < lines.length && nextPageLine === null) {
      const line = lines[nextPageLineIndex];
      if (line?.tag !== "separator" && line?.tag !== "page_break") {
        nextPageLine = line;
      }
      nextPageLineIndex++;
    }

    if (nextPageLine && nextPageLine.tag !== "scene") {
      sceneSplit = true;
    }

    page.push({
      tag: "page_break",
      sceneSplit: sceneSplit,
    });
    const append = this.breakLines(lines.slice(p + 1), breaker, print, config);
    return page.concat(append);
  }

  protected breaker(
    index: number,
    lines: DocumentLine[],
    config: TypesetterConfig
  ): boolean {
    const CONTD = config.screenplay_print_dialogue_contd || "(CONT'D)";
    const MORE = config.screenplay_print_dialogue_more || "(MORE)";
    const splitAcrossPages =
      config.screenplay_print_dialogue_split_across_pages;

    let before = index - 1;
    while (before && !lines[before]?.text) {
      before--;
    }

    let after = index + 1;
    while (after < lines.length && !lines[after]?.text) {
      after++;
    }

    // possible break is after this token
    const tokenOnBreak = lines[index];
    if (!tokenOnBreak) {
      return false;
    }

    const tokenAfter = lines[after];
    const tokenBefore = lines[before];

    if (
      tokenOnBreak.tag === "scene" &&
      tokenAfter &&
      tokenAfter.tag !== "scene"
    ) {
      return false;
    } else if (
      tokenAfter &&
      tokenAfter.tag === "transition" &&
      tokenOnBreak.tag !== "transition"
    ) {
      return false;
    }
    // action block 1,2 or 3 lines.
    // don't break unless it's the last line
    else if (
      tokenOnBreak.tag === "action" &&
      tokenOnBreak.token &&
      tokenOnBreak.token.content &&
      tokenOnBreak.token.content.length < 4 &&
      tokenOnBreak.token.content.indexOf(tokenOnBreak) !==
        tokenOnBreak.token.content.length - 1
    ) {
      return false;
    }
    // for and more lines
    // break on any line different than first and penultimate
    // ex.
    // aaaaaaaaa <--- don't break after this line
    // aaaaaaaaa <--- allow breaking after this line
    // aaaaaaaaa <--- allow breaking after this line
    // aaaaaaaaa <--- don't break after this line
    // aaaaaaaaa <--- allow breaking after this line
    else if (
      tokenOnBreak.tag === "action" &&
      tokenOnBreak.token &&
      tokenOnBreak.token.content &&
      tokenOnBreak.token.content.length >= 4 &&
      (tokenOnBreak.token.content.indexOf(tokenOnBreak) === 0 ||
        tokenOnBreak.token.content.indexOf(tokenOnBreak) ===
          tokenOnBreak.token.content.length - 2)
    ) {
      return false;
    } else if (
      splitAcrossPages &&
      tokenOnBreak.tag === "dialogue" &&
      tokenAfter &&
      tokenAfter.tag === "dialogue" &&
      tokenBefore?.tag === "dialogue" &&
      !tokenOnBreak.column
    ) {
      let newPageCharacter;
      let character = before;
      while (
        lines[character] &&
        lines[character]?.tag !== "dialogue_character_name"
      ) {
        character--;
      }
      let characterName = "";
      if (lines[character]) {
        characterName = lines[character]?.text || "";
      }

      const moreItem: DocumentLine = {
        tag: "more",
        content: [{ text: MORE }],
        line: tokenOnBreak.line,
        from: tokenOnBreak.from,
        to: tokenOnBreak.to,
      };
      const contdText =
        characterName.trim() +
        " " +
        (characterName.indexOf(CONTD) !== -1 ? "" : CONTD);
      lines.splice(
        index,
        0,
        { ...moreItem },
        (newPageCharacter = {
          tag: "dialogue_character_name",
          content: [{ text: contdText }],
          line: tokenAfter.line,
          from: tokenAfter.from,
          to: tokenAfter.to,
        })
      );

      if (lines[character] && lines[character]?.rightColumn) {
        const dialogueOnPageLength = index - character;
        const rightLinesOnThisPage = (lines[character]?.rightColumn || [])
          .slice(0, dialogueOnPageLength)
          .concat([
            {
              tag: "text",
              content: [{ text: MORE }],
              line: tokenOnBreak.line,
              from: tokenOnBreak.from,
              to: tokenOnBreak.to,
            },
          ]);
        const rightText =
          (rightLinesOnThisPage[0]?.text || "").trim() +
          " " +
          ((rightLinesOnThisPage[0]?.text || "").indexOf(CONTD) !== -1
            ? ""
            : CONTD);
        const rightLinesForNextPage = [
          {
            tag: "dialogue_character_name",
            text: rightText,
            line: tokenAfter.line,
            from: tokenAfter.from,
            to: tokenAfter.to,
          },
        ].concat(
          (lines[character]?.rightColumn || []).slice(dialogueOnPageLength)
        );

        const characterLine = lines[character];
        if (characterLine) {
          characterLine.rightColumn = rightLinesOnThisPage;
        }
        if (rightLinesForNextPage.length > 1) {
          newPageCharacter.rightColumn = rightLinesForNextPage;
        }
      }

      return true;
    } else if (
      [
        "dialogue_character_name",
        "dialogue_line_parenthetical",
        "dialogue",
      ].includes(lines[index]?.tag || "") &&
      lines[after] &&
      ["dialogue_line_parenthetical", "dialogue"].includes(
        lines[after]?.tag || ""
      )
    ) {
      return false; // or break
    }
    return true;
  }
}
