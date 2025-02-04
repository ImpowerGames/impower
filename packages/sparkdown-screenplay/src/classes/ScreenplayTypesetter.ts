import { PAGE_ALIGNMENTS } from "../constants/PAGE_ALIGNMENTS";
import { PAGE_POSITIONS } from "../constants/PAGE_POSITIONS";
import { DocumentSpan, PageLine } from "../types/DocumentSpan";
import { FormattedText } from "../types/FormattedText";
import { PrintProfile } from "../types/PrintProfile";
import { ScreenplayToken } from "../types/ScreenplayToken";
import {
  MetadataTokenType,
  ScreenplayTokenType,
} from "../types/ScreenplayTokenType";
import { ScreenplayConfig } from "../types/ScreenplayConfig";
import { TextOptions } from "../types/TextOptions";
import { styleText } from "../utils/styleText";

export class ScreenplayTypesetter {
  getInfo(spans: DocumentSpan[]) {
    let title = "";
    let author = "";
    const firstToken = spans[0];
    if (firstToken?.tag === "meta" && firstToken.positions) {
      for (const positionLines of Object.values(firstToken.positions)) {
        const titleLines = positionLines.filter((l) => l.tag === "title");
        title = titleLines
          .map((l) => l.content.map((c) => c.text).join("") || "")
          .join(" ");

        const authorLines = positionLines.filter((l) => l.tag === "author");
        author = authorLines
          .map((l) => l.content.map((c) => c.text).join("") || "")
          .join(" ");
      }
    }
    return { title, author };
  }

  compose(
    tokens: ScreenplayToken[],
    config?: ScreenplayConfig,
    print?: PrintProfile
  ): DocumentSpan[] {
    let spans: DocumentSpan[] = [];
    const metadata: Record<string, PageLine[]> = {};
    const metadataTags = Object.keys(PAGE_POSITIONS);
    let sceneIndex = 0;

    const addSeparator = (lines: DocumentSpan[]) => {
      const prevLine = lines.at(-1);
      if (prevLine && prevLine.tag !== "separator") {
        lines.push({ tag: "separator", content: [] });
      }
    };

    for (const t of tokens) {
      const max =
        print?.settings?.[t.tag]?.max ?? print?.settings?.default?.max ?? null;
      if (metadataTags.includes(t.tag)) {
        const position = PAGE_POSITIONS[t.tag as MetadataTokenType];
        const align = PAGE_ALIGNMENTS[position];
        metadata[t.tag] = this.format(t.tag, t.text, null, print, { align });
      } else if (t.tag === "knot") {
        if (config?.screenplay_print_sections) {
          const lines = this.format(t.tag, t.text || "", max, print).map(
            (w) => ({
              ...w,
              level: 0,
            })
          );
          if (lines.length > 0) {
            addSeparator(spans);
            spans.push(...lines);
          }
        }
      } else if (t.tag === "stitch") {
        if (config?.screenplay_print_sections) {
          const lines = this.format(t.tag, t.text, max, print).map((w) => ({
            ...w,
            level: 1,
          }));
          if (lines.length > 0) {
            addSeparator(spans);
            spans.push(...lines);
          }
        }
      } else if (t.tag === "scene") {
        const lines = this.format(t.tag, t.text, max, print, {
          bold: config?.screenplay_print_scene_headers_bold ? true : undefined,
        });
        if (lines.length > 0) {
          lines[0]!.scene = t.scene ?? sceneIndex + 1;
          addSeparator(spans);
          spans.push(...lines);
          sceneIndex++;
        }
      } else if (t.tag === "transition") {
        const lines = this.format(t.tag, t.text, max, print, {
          align: "right",
        });
        if (lines.length > 0) {
          addSeparator(spans);
          spans.push(...lines);
        }
      } else if (t.tag === "action") {
        const lines = this.format(t.tag, t.text, max, print);
        if (lines.length > 0) {
          addSeparator(spans);
          spans.push(...lines);
        }
      } else if (
        t.tag === "dialogue_character" ||
        t.tag === "parenthetical" ||
        t.tag === "dialogue"
      ) {
        const dualMax =
          max == null ? max : max * (print?.dual_max_factor ?? 0.75);
        const columnMax = t.tag === "dialogue" && t.position ? dualMax : max;
        const columnLines = this.format(t.tag, t.text, columnMax, print);
        if (columnLines.length > 0) {
          if (t.position === "l" || t.position === "r") {
            const prevSpan = spans.at(-1);
            if (t.tag === "dialogue_character" && t.position === "l") {
              addSeparator(spans);
              spans.push({
                tag: "split",
                positions: {
                  [t.position]: columnLines,
                },
              });
            } else if (prevSpan?.tag === "split") {
              prevSpan.positions ??= {};
              prevSpan.positions[t.position] ??= [];
              prevSpan.positions[t.position]!.push(...columnLines);
            }
          } else {
            if (t.tag === "dialogue_character") {
              addSeparator(spans);
            }
            spans.push(...columnLines);
          }
        }
      }
    }

    spans = this.breakLinesAcrossPages(spans, config, print);

    while (
      spans.at(0)?.tag === "page_break" ||
      spans.at(0)?.tag === "separator"
    ) {
      // Trim leading page breaks and separators
      spans.shift();
    }

    while (
      spans.at(-1)?.tag === "page_break" ||
      spans.at(-1)?.tag === "separator"
    ) {
      // Trim trailing page breaks and separators
      spans.pop();
    }

    const metadataSpan: DocumentSpan = { tag: "meta", positions: {} };
    for (const [tag, lines] of Object.entries(metadata)) {
      const position = PAGE_POSITIONS[tag as MetadataTokenType];
      if (position) {
        metadataSpan.positions[position] ??= [];
        metadataSpan.positions[position].push(...lines);
        addSeparator(metadataSpan.positions[position]);
      }
    }

    return [metadataSpan, ...spans];
  }

  protected format(
    tag: ScreenplayTokenType,
    text: string | undefined,
    max: number | null,
    print?: PrintProfile,
    overrides?: TextOptions
  ): PageLine[] {
    const lines = (text || "").split(/\r\n|\r|\n/);
    const spans: PageLine[] = [];
    for (const line of lines) {
      const content = this.style(line, overrides).map((c) => ({
        ...c,
        italic:
          print?.settings?.[tag as keyof PrintProfile["settings"]]?.italic ??
          c.italic,
        align:
          print?.settings?.[tag as keyof PrintProfile["settings"]]?.align ??
          c.align,
      }));
      if (content.length > 0) {
        spans.push(...this.textWrap(tag, content, max));
      }
    }
    return spans;
  }

  protected style(text: string, overrides?: TextOptions): FormattedText[] {
    return styleText(text, overrides);
  }

  protected wrapChars(
    tag: ScreenplayTokenType,
    styledChars: FormattedText[],
    max: number | null
  ): PageLine[] {
    if (max == null || max <= 0 || styledChars.length <= max) {
      return [
        {
          tag,
          content: styledChars,
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
      },
      ...this.textWrap(tag, styledChars.slice(wrapAt + 1), max),
    ];
  }

  protected textWrap(
    tag: ScreenplayTokenType,
    styledChars: FormattedText[],
    max: number | null
  ): PageLine[] {
    const wrappedLines = this.wrapChars(tag, styledChars, max);
    for (const line of wrappedLines) {
      line.content = this.consolidateContent(line.content);
    }
    return wrappedLines;
  }

  protected consolidateContent(content: FormattedText[] | undefined) {
    const consolidatedContent: FormattedText[] = [];
    if (content) {
      for (const c of content) {
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
      }
    }
    return consolidatedContent;
  }

  protected breakLinesAcrossPages(
    spans: DocumentSpan[],
    config?: ScreenplayConfig,
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
      const spanLineCount =
        span.tag === "split"
          ? Math.max(
              ...Object.values(span.positions || {}).map(
                (positionLines) => positionLines.length
              ),
              1
            )
          : 1;
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
              lineOnBreak.tag !== "split" &&
              lineBefore?.tag !== "dialogue_character" &&
              lineBefore?.tag !== "parenthetical" &&
              lineOnBreak.tag === "dialogue" && //                    dialogue <--
              (lineAfter?.tag === "dialogue" ||
                lineAfter?.tag === "parenthetical") // dialogue or (parenthetical);
            ) {
              const moreSpan: DocumentSpan = {
                tag: "more",
                content: [{ text: MORE }],
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
                pageBreakSuffix.tag !== "meta" &&
                pageBreakSuffix.tag !== "split" &&
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
            result.push({ tag: "page_break", content: [] });
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
    config?: ScreenplayConfig
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
    const lineContentBefore = lines[contentBefore];
    while (
      contentBefore &&
      (lineContentBefore?.tag === "meta" ||
        lineContentBefore?.tag === "split" ||
        !lineContentBefore?.content)
    ) {
      contentBefore--;
    }

    let contentAfter = index + 1;
    const lineContentAfter = lines[contentAfter];
    while (
      contentAfter < lines.length &&
      (lineContentAfter?.tag === "meta" ||
        lineContentAfter?.tag === "split" ||
        !lineContentAfter?.content)
    ) {
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
    else if (lineOnBreak.tag === "parenthetical") {
      return false;
    }
    // Don't page break during dialogue if splitting dialogue across pages is not allowed
    else if (!splitDialogueAcrossPages && lineOnBreak.tag === "dialogue") {
      return false;
    }
    // Don't page break if line before is character or parenthetical
    else if (
      splitDialogueAcrossPages &&
      lineOnBreak.tag !== "split" &&
      (lineBefore?.tag === "dialogue_character" ||
        lineBefore?.tag === "parenthetical") && // CHARACTER or (parenthetical)
      lineOnBreak.tag === "dialogue" && //                       dialogue <--
      (lineAfter?.tag === "dialogue" || lineAfter?.tag === "parenthetical") //    dialogue or (parenthetical)
    ) {
      return false;
    }
    return true;
  }
}
