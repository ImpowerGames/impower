import { PAGE_ALIGNMENTS } from "../constants/PAGE_ALIGNMENTS";
import { PAGE_POSITIONS } from "../constants/PAGE_POSITIONS";
import { BlockLayout, DocumentSpan, PageLine } from "../types/DocumentSpan";
import { FormattedText } from "../types/FormattedText";
import { LineOptions } from "../types/LineOptions";
import { PrintProfile } from "../types/PrintProfile";
import { ScreenplayConfig } from "../types/ScreenplayConfig";
import { ScreenplayToken } from "../types/ScreenplayToken";
import {
  BlockTokenType,
  MetadataTokenType,
  ScreenplayTokenType,
} from "../types/ScreenplayTokenType";
import { TextOptions } from "../types/TextOptions";
import { styleText } from "../utils/styleText";

export default class ScreenplayTypesetter {
  getInfo(spans: DocumentSpan[]) {
    let title = "";
    let author = "";
    const firstToken = spans[0];
    if (firstToken?.tag === "meta" && firstToken.positions) {
      for (const positionLines of Object.values(firstToken.positions)) {
        const titleLines = positionLines.filter((l) => l.tag === "meta:title");
        title = titleLines
          .map((l) => l.content.map((c) => c.text).join("") || "")
          .join(" ");

        const authorLines = positionLines.filter(
          (l) => l.tag === "meta:author"
        );
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
    profile?: PrintProfile
  ): DocumentSpan[] {
    let spans: DocumentSpan[] = [];
    const metadata: Record<string, PageLine[]> = {};
    const metadataTags = Object.keys(PAGE_POSITIONS);
    let sceneIndex = 0;

    for (const t of tokens) {
      if (metadataTags.includes(t.tag)) {
        const position = PAGE_POSITIONS[t.tag as MetadataTokenType];
        const align = PAGE_ALIGNMENTS[position];
        metadata[t.tag] = this.format(
          t.tag,
          t.text,
          profile,
          { prefix: t.prefix, suffix: t.suffix },
          { align }
        );
      } else if (t.tag === "page_break") {
        const prevSpan = spans.at(-1);
        if (prevSpan && prevSpan.tag !== "page_break") {
          spans.push({ tag: t.tag });
        }
      } else if (t.tag === "separator") {
        const prevSpan = spans.at(-1);
        if (prevSpan && prevSpan.tag !== "separator") {
          spans.push({ tag: t.tag });
        }
      } else if (t.tag === "function") {
        const level = 0;
        const lines = this.format(
          t.tag,
          t.text || "",
          profile,
          { prefix: t.prefix, suffix: t.suffix },
          undefined,
          {
            level,
          }
        );
        if (lines.length > 0) {
          spans.push({ tag: t.tag, lines });
        }
      } else if (t.tag === "scene") {
        const level = 0;
        const lines = this.format(
          t.tag,
          t.text || "",
          profile,
          { prefix: t.prefix, suffix: t.suffix },
          undefined,
          {
            level,
          }
        );
        if (lines.length > 0) {
          spans.push({ tag: t.tag, lines });
        }
      } else if (t.tag === "branch") {
        const level = 1;
        const lines = this.format(
          t.tag,
          t.text,
          profile,
          { prefix: t.prefix, suffix: t.suffix },
          undefined,
          {
            level,
          }
        );
        if (lines.length > 0) {
          spans.push({ tag: t.tag, lines });
        }
      } else if (t.tag === "knot") {
        const level = 0;
        const lines = this.format(
          t.tag,
          t.text || "",
          profile,
          { prefix: t.prefix, suffix: t.suffix },
          undefined,
          {
            level,
          }
        );
        if (lines.length > 0) {
          spans.push({ tag: t.tag, lines });
        }
      } else if (t.tag === "stitch") {
        const level = 1;
        const lines = this.format(
          t.tag,
          t.text,
          profile,
          { prefix: t.prefix, suffix: t.suffix },
          undefined,
          {
            level,
          }
        );
        if (lines.length > 0) {
          spans.push({ tag: t.tag, lines });
        }
      } else if (t.tag === "title") {
        const lines = this.format(
          t.tag,
          t.text,
          profile,
          { prefix: t.prefix, suffix: t.suffix },
          undefined
        );
        if (lines.length > 0) {
          spans.push({ tag: t.tag, lines });
        }
      } else if (t.tag === "heading") {
        const style = config?.screenplay_print_headings_bold
          ? { bold: true }
          : undefined;
        const lines = this.format(
          t.tag,
          t.text,
          profile,
          { prefix: t.prefix, suffix: t.suffix },
          style
        );
        if (lines.length > 0) {
          const scene = t.scene ?? sceneIndex + 1;
          lines[0]!.scene = scene;
          spans.push({ tag: t.tag, lines });
          sceneIndex++;
        }
      } else if (t.tag === "transitional") {
        const style = { align: "right" };
        const lines = this.format(
          t.tag,
          t.text,
          profile,
          { prefix: t.prefix, suffix: t.suffix },
          style
        );
        if (lines.length > 0) {
          spans.push({ tag: t.tag, lines });
        }
      } else if (t.tag === "action") {
        const lines = this.format(
          t.tag,
          t.text,
          profile,
          { prefix: t.prefix, suffix: t.suffix },
          undefined,
          {
            canSplitAfter: 3,
          }
        );
        if (lines.length > 0) {
          spans.push({ tag: t.tag, lines });
        }
      } else if (
        t.tag === "dialogue_character" ||
        t.tag === "dialogue_parenthetical" ||
        t.tag === "dialogue_content"
      ) {
        const lineOptions: LineOptions | undefined = t.position
          ? { position: t.position }
          : {
              canSplitAfter:
                t.tag === "dialogue_content" &&
                config?.screenplay_print_dialogue_split_across_pages
                  ? 1
                  : undefined,
              repeatAfterSplit: t.tag === "dialogue_character",
            };
        const lines = this.format(
          t.tag,
          t.text,
          profile,
          { prefix: t.prefix, suffix: t.suffix },
          undefined,
          lineOptions
        );
        if (lines.length > 0) {
          if (t.position === "l" || t.position === "r") {
            const prevSpan = spans.at(-1);
            if (t.tag === "dialogue_character" && t.position === "l") {
              spans.push({
                tag: "dual",
                positions: {
                  [t.position]: lines,
                },
              });
            } else if (prevSpan?.tag === "dual") {
              prevSpan.positions ??= {};
              prevSpan.positions[t.position] ??= [];
              prevSpan.positions[t.position]!.push(...lines);
            }
          } else {
            if (t.tag === "dialogue_character") {
              spans.push({ tag: "dialogue", lines });
            } else {
              const prevSpan = spans.at(-1);
              if (prevSpan?.tag === "dialogue") {
                prevSpan.lines.push(...lines);
              }
            }
          }
        }
      } else if (t.tag === "choice") {
        const lines = this.format(t.tag, t.text, profile, {
          prefix: t.prefix,
          suffix: t.suffix,
        });
        if (lines.length > 0) {
          spans.push({ tag: t.tag, lines });
        }
      }
    }

    const metadataSpan: DocumentSpan = { tag: "meta", positions: {} };
    for (const [t, lines] of Object.entries(metadata)) {
      const tag = t as MetadataTokenType;
      const position = PAGE_POSITIONS[tag];
      if (position) {
        metadataSpan.positions[position] ??= [];
        metadataSpan.positions[position].push(...lines);
        metadataSpan.positions[position].push(this.line(tag));
      }
    }

    while (spans.at(0)?.tag === "page_break") {
      // trim away leading page breaks
      spans.shift();
    }
    while (spans.at(-1)?.tag === "page_break") {
      // trim away trailing page breaks
      spans.pop();
    }

    while (spans.at(0)?.tag === "separator") {
      // trim away leading separators
      spans.shift();
    }
    while (spans.at(-1)?.tag === "separator") {
      // trim away trailing separators
      spans.pop();
    }

    return [metadataSpan, ...spans];
  }

  protected block = (
    tag: BlockTokenType,
    text: string,
    profile?: PrintProfile,
    affixOptions: { prefix?: string; suffix?: string } = {},
    textOptions: TextOptions = {}
  ): BlockLayout => {
    return {
      tag,
      lines: this.format(tag, text, profile, affixOptions, textOptions),
    };
  };

  protected format(
    tag: ScreenplayTokenType,
    text: string = "",
    profile?: PrintProfile,
    affixOptions: { prefix?: string; suffix?: string } = {},
    textOptions: TextOptions = {},
    lineOptions: LineOptions = {}
  ): PageLine[] {
    let affixedText = text;
    if (affixOptions.prefix) {
      // Surround prefix with `` so it is printed as is (ignoring style markers).
      affixedText = "`" + affixOptions.prefix + "`" + affixedText;
    }
    if (affixOptions.suffix) {
      // Surround suffix with `` so it is printed as is (ignoring style markers).
      affixedText += "`" + affixOptions.suffix + "`";
    }
    const textLines = affixedText.split(/\r\n|\r|\n/);
    const pageLines: PageLine[] = [];
    for (const textLine of textLines) {
      if (textLine) {
        pageLines.push(
          this.line(tag, textLine, profile, textOptions, lineOptions)
        );
      }
    }
    return pageLines;
  }

  protected line(
    tag: ScreenplayTokenType,
    text: string = "",
    profile?: PrintProfile,
    textOptions: TextOptions = {},
    lineOptions: LineOptions = {}
  ): PageLine {
    const styledContent = this.style(tag, text, textOptions, profile);
    const content = this.consolidateContent(styledContent);
    return {
      tag,
      content,
      ...lineOptions,
    };
  }

  protected style(
    tag: ScreenplayTokenType,
    text: string | undefined,
    textOptions: TextOptions = {},
    profile?: PrintProfile
  ): FormattedText[] {
    if (text == null) {
      return [];
    }
    if (!text) {
      return [{ text: "" }];
    }
    const defaultTextSettings: TextOptions = {};
    const settings = profile?.settings?.[tag as keyof PrintProfile["settings"]];
    if (settings?.color) {
      defaultTextSettings.color = settings?.color;
    }
    if (settings?.italic) {
      defaultTextSettings.italic = settings?.italic;
    }
    if (settings?.align) {
      defaultTextSettings.align = settings?.align;
    }
    return styleText(text, { ...defaultTextSettings, ...textOptions });
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
}
