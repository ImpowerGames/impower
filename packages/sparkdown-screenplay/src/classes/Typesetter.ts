import { SparkToken } from "../../../sparkdown/src";
import FRONTMATTER_ALIGNMENTS from "../../../sparkdown/src/constants/FRONTMATTER_ALIGNMENTS";
import FRONTMATTER_POSITIONS from "../../../sparkdown/src/constants/FRONTMATTER_POSITIONS";
import { DocumentSpan } from "../types/DocumentSpan";
import { FormattedText } from "../types/FormattedText";
import { PrintProfile } from "../types/PrintProfile";
import { SparkScreenplayConfig } from "../types/SparkScreenplayConfig";
import { TextOptions } from "../types/TextOptions";
import { styleText } from "../utils/styleText";

export class Typesetter {
  getInfo(frontMatter: Record<string, string[]>) {
    return {
      title: frontMatter["title"]?.join(" ").replace("\n", " ") || "",
      author:
        (frontMatter["author"]?.join(", ") || "").replace("\n", " ") +
        (frontMatter["authors"]?.join(", ") || "").replace("\n", " "),
    };
  }

  formatFrontMatter(
    frontMatter: Record<string, string[]>
  ): Record<string, DocumentSpan> {
    const areas: Record<string, string[]> = {};

    Object.entries(frontMatter).forEach(([k, v]) => {
      const position = FRONTMATTER_POSITIONS[k.toLowerCase()] || k;
      areas[position] ??= [];
      areas[position]?.push(...v);
    });

    const spans: Record<string, DocumentSpan> = {};

    Object.entries(areas).forEach(([k, v]) => {
      const text = v.join("\n\n");
      const align = FRONTMATTER_ALIGNMENTS[k] || undefined;
      spans[k] = {
        tag: k,
        line: -1,
        from: -1,
        to: -1,
        content: this.consolidateContent(this.style(text, { align })),
      };
    });

    return spans;
  }

  formatBody(
    tokens: SparkToken[],
    config?: SparkScreenplayConfig,
    print?: PrintProfile
  ): DocumentSpan[] {
    let lines: DocumentSpan[] = [];

    const pushSeparator = () => {
      const lastLine = lines.at(-1);
      if (lastLine && lastLine.tag !== "separator") {
        lines.push({
          tag: "separator",
          line: lastLine.line,
          from: lastLine.to + 1,
          to: lastLine.to + 1,
          content: [{ text: "" }],
        });
      }
    };

    tokens.forEach((t: SparkToken) => {
      if (t.tag === "chunk") {
        lines.push({
          tag: "page_break",
          line: t.line,
          from: t.from,
          to: t.to,
        });
      } else if (t.tag === "section") {
        const max =
          print?.settings?.[t.tag]?.max ?? print?.settings?.action.max ?? null;
        lines.push(
          ...this.formatLine(t.tag, t.name, max, t.line, t.from, print).map(
            (w) => ({ ...w, level: t.level })
          )
        );
        if (config?.screenplay_print_sections) {
          pushSeparator();
        }
      } else if (t.tag === "scene") {
        const sceneLines: DocumentSpan[] = [];
        const max =
          print?.settings?.[t.tag]?.max ?? print?.settings?.action.max ?? null;
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
                  print,
                  config?.screenplay_print_scene_headers_bold
                    ? { bold: true }
                    : undefined
                ).map((w) => ({
                  ...w,
                  scene: t.index,
                }))
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
        const transitionLines: DocumentSpan[] = [];
        const max =
          print?.settings?.[t.tag]?.max ?? print?.settings?.action.max ?? null;
        if (t.content) {
          t.content.forEach((c) => {
            if (c.text != undefined) {
              transitionLines.push(
                ...this.formatLine(t.tag, c.text, max, c.line, c.from, print, {
                  align: "right",
                })
              );
            }
          });
        }
        lines.push(...transitionLines);
        pushSeparator();
      } else if (t.tag === "action") {
        const actionLines: DocumentSpan[] = [];
        const max =
          print?.settings?.[t.tag]?.max ?? print?.settings?.action.max ?? null;
        t.content?.forEach((box) => {
          box.content?.forEach((c) => {
            if (c.text != undefined) {
              actionLines.push(
                ...this.formatLine(t.tag, c.text, max, c.line, c.from, print)
              );
            }
          });
        });
        lines.push(...actionLines);
        pushSeparator();
      } else if (t.tag === "dialogue") {
        const dialogueLines: DocumentSpan[] = [];
        if (t.characterName?.text || t.characterParenthetical?.text) {
          const tag = "dialogue_character";
          const max =
            print?.settings?.[tag]?.max ??
            print?.settings?.dialogue?.max ??
            null;
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
              ...this.formatLine(tag, text, max, line, from, print)
            );
          }
        }
        t.content?.forEach((box) => {
          box.content?.forEach((c) => {
            if (c.text != null) {
              if (c.tag === "dialogue_line_parenthetical") {
                const tag = "dialogue_parenthetical";
                const max =
                  print?.settings?.[tag]?.max ??
                  print?.settings?.dialogue?.max ??
                  null;
                dialogueLines.push(
                  ...this.formatLine(tag, c.text, max, c.line, c.from, print)
                );
              } else if (c.tag === "text") {
                const tag = "dialogue";
                const max =
                  print?.settings?.[tag]?.max ??
                  print?.settings?.dialogue?.max ??
                  null;
                const dualMax =
                  max == null ? max : max * (print?.dual_max_factor ?? 0.75);
                const dialogueMax = t.position ? dualMax : max;
                dialogueLines.push(
                  ...this.formatLine(
                    tag,
                    c.text,
                    dialogueMax,
                    c.line,
                    c.from,
                    print
                  )
                );
              }
            }
          });
        });
        if (t.position) {
          const isOdd = t.position % 2 !== 0;
          if (isOdd) {
            // left (odd position)
            lines.push({
              tag: t.tag,
              line: t.line,
              from: t.from,
              to: t.to,
              leftColumn: dialogueLines,
            });
          } else {
            // right (even position)
            const prevLine = lines.at(-1);
            if (prevLine) {
              prevLine.rightColumn = dialogueLines;
            }
            pushSeparator();
          }
        } else {
          lines.push(...dialogueLines);
          pushSeparator();
        }
      }
    });

    lines = this.breakLinesAcrossPages(lines, config, print);

    while (
      lines.at(0)?.tag === "page_break" ||
      lines.at(0)?.tag === "separator"
    ) {
      // Trim leading page breaks and separators
      lines.shift();
    }

    while (
      lines.at(-1)?.tag === "page_break" ||
      lines.at(-1)?.tag === "separator"
    ) {
      // Trim trailing page breaks and separators
      lines.pop();
    }

    return lines;
  }

  protected formatLine(
    tag: string,
    text: string,
    max: number | null,
    line: number,
    from: number,
    print?: PrintProfile,
    overrides?: TextOptions
  ): DocumentSpan[] {
    const trimmed = text.replace(/[\n\r]+$/, "");
    const content = this.style(trimmed, overrides).map((c) => ({
      ...c,
      italic:
        print?.settings?.[tag as keyof PrintProfile["settings"]]?.italic ??
        c.italic,
      align:
        print?.settings?.[tag as keyof PrintProfile["settings"]]?.align ??
        c.align,
    }));
    return this.textWrap(tag, content, max, line, from);
  }

  protected style(text: string, overrides?: TextOptions): FormattedText[] {
    return styleText(text, overrides);
  }

  protected wrapChars(
    tag: string,
    styledChars: FormattedText[],
    max: number | null,
    line: number,
    from: number
  ): DocumentSpan[] {
    if (max == null || max <= 0 || styledChars.length <= max) {
      return [
        {
          tag,
          content: styledChars,
          line,
          from,
          to: from + styledChars.length - 1,
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
      },
      ...this.textWrap(
        tag,
        styledChars.slice(wrapAt + 1),
        max,
        line,
        from + wrapAt
      ),
    ];
  }

  protected textWrap(
    tag: string,
    styledChars: FormattedText[],
    max: number | null,
    line: number,
    from: number
  ): DocumentSpan[] {
    const wrappedLines = this.wrapChars(tag, styledChars, max, line, from);
    wrappedLines.forEach((line) => {
      line.content = this.consolidateContent(line.content);
    });
    return wrappedLines;
  }

  protected consolidateContent(content: FormattedText[] | undefined) {
    const consolidatedContent: FormattedText[] = [];
    content?.forEach((c) => {
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
    return consolidatedContent;
  }

  protected breakLinesAcrossPages(
    spans: DocumentSpan[],
    config?: SparkScreenplayConfig,
    print?: PrintProfile
  ): DocumentSpan[] {
    const maxLineCountPerPage = print?.lines_per_page ?? null;
    if (maxLineCountPerPage == null || maxLineCountPerPage <= 0) {
      return spans;
    }

    const CONTD = config?.screenplay_print_dialogue_contd || "(CONT'D)";
    const MORE = config?.screenplay_print_dialogue_more || "(MORE)";
    const splitDialogueAcrossPages =
      config?.screenplay_print_dialogue_split_across_pages ?? true;

    const result: DocumentSpan[] = [];

    let pageLineCount = 0;

    for (let i = 0; i < spans.length; i += 1) {
      const span = spans[i]!;
      const spanLineCount = Math.max(
        span.leftColumn?.length ?? 0,
        span.rightColumn?.length ?? 0,
        1
      );
      if (span.tag === "separator" && pageLineCount === 0) {
        // skip blank lines at the top of a new page
      } else {
        result.push(span);
        if (span.tag === "page_break") {
          // manual page break
          pageLineCount = 0;
        } else {
          pageLineCount += spanLineCount;
          if (pageLineCount > maxLineCountPerPage) {
            // We are over the limit for the current page.
            // So rewind one span
            i -= 1;
            result.pop();

            // And keep rewinding until we find a breakable line
            while (i > 0 && !this.canBreakAfter(i, spans, config)) {
              i -= 1;
              result.pop();
            }

            // Auto-include "(MORE)" and "(CONT'D)" when splitting dialogue across page break
            let pageBreakSuffix: DocumentSpan | undefined = undefined;
            const lineBefore = spans[i - 1];
            const lineOnBreak = spans[i];
            const lineAfter = spans[i + 1];
            if (
              splitDialogueAcrossPages &&
              lineOnBreak &&
              !lineOnBreak.leftColumn &&
              !lineOnBreak.rightColumn &&
              lineBefore?.tag !== "dialogue_character" &&
              lineBefore?.tag !== "dialogue_parenthetical" &&
              lineOnBreak.tag === "dialogue" && //                    dialogue <--
              (lineAfter?.tag === "dialogue" ||
                lineAfter?.tag === "dialogue_parenthetical") // dialogue or (parenthetical);
            ) {
              const moreSpan: DocumentSpan = {
                tag: "more",
                content: [{ text: MORE }],
                line: lineOnBreak.line,
                from: lineOnBreak.from,
                to: lineOnBreak.to,
              };
              let characterLine = i;
              while (
                spans[characterLine]?.tag !== "dialogue_character" &&
                characterLine > -1
              ) {
                characterLine--;
              }
              const characterNameSpan = spans[characterLine];
              pageBreakSuffix = characterNameSpan
                ? JSON.parse(JSON.stringify(characterNameSpan))
                : undefined;

              if (
                pageBreakSuffix &&
                pageBreakSuffix.content &&
                !pageBreakSuffix.content
                  ?.map((c) => c.text)
                  .join("")
                  .endsWith(" " + CONTD)
              ) {
                pageBreakSuffix.content ??= [];
                pageBreakSuffix.content.push({
                  text: " " + CONTD,
                });
              }
              result.push(moreSpan);
            }

            // Page break
            result.push({
              tag: "page_break",
              line: lineOnBreak?.line ?? -1,
              from: lineOnBreak?.from ?? -1,
              to: lineOnBreak?.to ?? -1,
            });
            pageLineCount = 0;

            // Extra span after page break
            if (pageBreakSuffix) {
              result.push(pageBreakSuffix);
              pageLineCount += 1;
            }
          }
        }
      }
    }

    return result;
  }

  protected canBreakAfter(
    index: number,
    lines: DocumentSpan[],
    config?: SparkScreenplayConfig
  ): boolean {
    const splitDialogueAcrossPages =
      config?.screenplay_print_dialogue_split_across_pages ?? true;

    // possible page break after this token
    const lineOnBreak = lines[index];
    if (!lineOnBreak) {
      return false;
    }

    const line2Before = lines[index - 2];
    const lineBefore = lines[index - 1];
    const lineAfter = lines[index + 1];
    const line2After = lines[index + 2];
    const line3After = lines[index + 3];

    let contentBefore = index - 1;
    while (contentBefore && !lines[contentBefore]?.content) {
      contentBefore--;
    }

    let contentAfter = index + 1;
    while (contentAfter < lines.length && !lines[contentAfter]?.content) {
      contentAfter++;
    }

    const lineWithContentAfter = lines[contentAfter];

    // Ensure scene is not the last line on the page
    if (
      lineOnBreak.tag === "scene" && //        ...
      lineWithContentAfter?.tag !== "scene" // scene <--
    ) {
      return false;
    }
    // Ensure transition is kept together with previous contentful line.
    // In case previous description leads into transition, like so:
    // And with a bang we...
    //         SMASH CUT TO:
    else if (
      lineOnBreak.tag !== "transition" && //        ... <--
      lineWithContentAfter?.tag === "transition" // transition
    ) {
      return false;
    }
    // Don't page break during action that is only 2, or 3 lines long.
    else if (
      lineBefore?.tag !== lineOnBreak.tag && // ...
      lineOnBreak.tag === "action" && //        action <--
      lineAfter?.tag === lineOnBreak.tag && //  action
      line2After?.tag !== lineOnBreak.tag //    ...
    ) {
      // 1 of 2 consecutive action lines
      return false;
    } else if (
      lineBefore?.tag !== lineOnBreak.tag && // ...
      lineOnBreak.tag === "action" && //        action <--
      lineAfter?.tag === lineOnBreak.tag && //  action
      line2After?.tag === lineOnBreak.tag && // action
      line3After?.tag !== lineOnBreak.tag //    ...
    ) {
      // 1 of 3 consecutive action lines
      return false;
    } else if (
      line2Before?.tag !== lineOnBreak.tag && // ...
      lineBefore?.tag === lineOnBreak.tag && //  action
      lineOnBreak.tag === "action" && //         action <--
      lineAfter?.tag === lineOnBreak.tag && //   action
      line2After?.tag !== lineOnBreak.tag //     ...
    ) {
      // 2 of 3 consecutive action lines
      return false;
    }
    // For action that is 4+ lines long,
    // Don't page break on the first or penultimate line
    // ex.
    // aaaaaaaaa <--- don't break after this line
    // aaaaaaaaa <--- allow breaking after this line
    // aaaaaaaaa <--- allow breaking after this line
    // aaaaaaaaa <--- don't break after this line
    // aaaaaaaaa <--- allow breaking after this line
    else if (
      lineBefore?.tag !== lineOnBreak.tag && // ...
      lineOnBreak.tag === "action" && //        action <--
      lineAfter?.tag === lineOnBreak.tag && //  action
      line2After?.tag === lineOnBreak.tag && // action
      line3After?.tag === lineOnBreak.tag //    action
    ) {
      // 1 of 4+ consecutive action lines
      return false;
    } else if (
      line2Before?.tag === lineOnBreak.tag && // action
      lineBefore?.tag === lineOnBreak.tag && //  action
      lineOnBreak.tag === "action" && //         action <--
      lineAfter?.tag === lineOnBreak.tag && //   action
      line2After?.tag !== lineOnBreak.tag //     ...
    ) {
      // penultimate of 4+ consecutive action lines
      return false;
    }
    // Don't page break after CHARACTER
    else if (lineOnBreak.tag === "dialogue_character") {
      return false;
    }
    // Don't page break after (parenthetical)
    else if (lineOnBreak.tag === "dialogue_parenthetical") {
      return false;
    }
    // Don't page break during dialogue if splitting dialogue across pages is not allowed
    else if (!splitDialogueAcrossPages && lineOnBreak.tag === "dialogue") {
      return false;
    }
    // Don't page break if line before is character or parenthetical
    else if (
      splitDialogueAcrossPages &&
      !lineOnBreak.leftColumn &&
      !lineOnBreak.rightColumn &&
      (lineBefore?.tag === "dialogue_character" ||
        lineBefore?.tag === "dialogue_parenthetical") && // CHARACTER or (parenthetical)
      lineOnBreak.tag === "dialogue" && //                       dialogue <--
      (lineAfter?.tag === "dialogue" ||
        lineAfter?.tag === "dialogue_parenthetical") //    dialogue or (parenthetical)
    ) {
      return false;
    }
    return true;
  }
}
