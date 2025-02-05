import PDFKit, { text } from "pdfkit";
import { printTextbox } from "../textbox-for-pdfkit/src/utils/printTextbox";
import { getHeightOfTextbox } from "../textbox-for-pdfkit/src/utils/getHeightOfTextbox";
import { getWidthOfTextbox } from "../textbox-for-pdfkit/src/utils/getWidthOfTextbox";
import { wrapTextbox } from "../textbox-for-pdfkit/src/utils/wrapTextbox";
import { FormattedText } from "../textbox-for-pdfkit/src/types/FormattedText";
import { TextOptions } from "../textbox-for-pdfkit/src/types/TextOptions";
import {
  DocumentSpan,
  MetaLayout,
  PageLine,
} from "../../../sparkdown-screenplay/src/types/DocumentSpan";
import { ScreenplayPrintData } from "../../../sparkdown-screenplay/src/types/ScreenplayPrintData";
import { PrintProfile } from "../../../sparkdown-screenplay/src/types/PrintProfile";
import { ScreenplayTokenType } from "../../../sparkdown-screenplay/src/types/ScreenplayTokenType";
import { ScreenplayConfig } from "../../../sparkdown-screenplay/src/types/ScreenplayConfig";

// pdfkit accepts sizes in PDF points (72 per inch)
// https://pdfkit.org/docs/getting_started.html
const PDF_POINTS_PER_INCH = 72;

const REGEX_INDENT = /^(\s+)/;
const REGEX_ANY_CHAR = /./g;

interface ScreenplayPrinterState {
  progressIndex: number;
  fontHeight: number;
  fontWidth: number;
  outlineDepth: number;
  pageNumber: number;
  y: number;
  lastForciblyDeferredLines: PageLine[] | undefined;
}

export default class ScreenplayPrinter {
  protected _doc: PDFKit.PDFDocument;
  get doc() {
    return this._doc;
  }

  protected _spans: DocumentSpan[];
  get spans() {
    return this._spans;
  }

  protected _profile: PrintProfile;
  get profile() {
    return this._profile;
  }

  protected _config?: ScreenplayConfig;
  get config() {
    return this._config;
  }

  protected _onProgress?: (percentage: number) => void;

  protected _state: ScreenplayPrinterState;

  constructor(
    doc: PDFKit.PDFDocument,
    data: ScreenplayPrintData,
    onProgress?: (percentage: number) => void
  ) {
    this._doc = doc;
    this._spans = data.spans;
    this._profile = data.profile;
    this._config = data?.config;
    this._onProgress = onProgress;
    this._state = this.createNewState();
  }

  print(): void {
    const separator = this.getContentWithFonts([{ text: " " }]);

    this._state = this.createNewState();

    this._state.fontWidth = this.getWidthOfText(separator);
    this._state.fontHeight = this.getHeightOfText(separator);

    const metaLayout = this.getMetaSpan();
    if (metaLayout) {
      if (this.printTitle(metaLayout)) {
        this.addPage();
      }
    }
    this.incrementProgress();

    const bodySpans = this.getBodySpans();
    for (const span of bodySpans) {
      if (span.tag === "meta") {
        // Already handled meta span
      } else if (span.tag === "page_break") {
        // Add a new page
        this.addPage();
      } else if (span.tag === "dual") {
        // Print layout split into two columns
        if (span.positions?.l || span.positions?.r) {
          const height = Math.max(
            this.getHeightOfLines(span.positions.l || []),
            this.getHeightOfLines(span.positions.r || [])
          );
          if (this._state.y + height > this.getMaxY()) {
            this.addPage();
          }
          const firstYStart = this._state.y;
          if (span.positions?.l) {
            this.printLines(span.positions.l);
          }
          const firstYEnd = this._state.y;
          if (span.positions?.r) {
            this._state.y = firstYStart;
            this.printLines(span.positions.r);
          }
          const secondYEnd = this._state.y;
          this._state.y = Math.max(firstYEnd, secondYEnd);
          this.printSeparator();
        }
      } else {
        // Print block
        if (this.printBlockOfLinesAcrossPages(span.lines) > 0) {
          this.printSeparator();
        }
      }
      this.incrementProgress();
    }
  }

  addPage() {
    this._state.y = this._profile.top_margin;
    this._doc.addPage();
    this._state.pageNumber++;

    if (this._config?.screenplay_print_page_numbers) {
      if (this._state.pageNumber >= 2) {
        const pageNumber = this._state.pageNumber.toFixed() + ".";
        const pageNumberWidth = pageNumber.length * this._state.fontWidth;
        const pageNumberX =
          this._profile.page_width -
          this._profile.right_margin -
          pageNumberWidth;
        const pageNumberY = this.profile.page_number_top_margin;
        this.printText(pageNumber, pageNumberX, pageNumberY);
      }
    }

    const metaLayout = this.getMetaSpan();
    if (metaLayout) {
      this.printHeader(metaLayout);
      this.printFooter(metaLayout);
      this.printWatermark(metaLayout);
    }
  }

  printSeparator() {
    this._state.y += this._state.fontHeight;
  }

  printTitle(span: MetaLayout): boolean {
    const innerWidth =
      this._profile.page_width -
      this._profile.left_margin -
      this._profile.right_margin;
    const innerHeight =
      this._profile.page_height -
      this._profile.top_margin -
      this._profile.bottom_margin;
    const innerWidthThird = innerWidth / 3;
    const innerWidthHalf = innerWidth / 2;

    if (this._config?.screenplay_print_title_page && span.positions) {
      //top left
      const tlText = this.getCombinedContent(span?.positions?.["tl"]);
      const tlTextHeight = this.getHeightOfText(tlText, innerWidthThird, {
        align: "left",
      });
      this.printText(
        tlText,
        this._profile.left_margin,
        this._profile.top_margin,
        {
          width: innerWidthThird,
          align: "left",
          links: true,
        }
      );

      //top center
      const tcText = this.getCombinedContent(span?.positions?.["tc"]);
      const tcTextHeight = this.getHeightOfText(tcText, innerWidthThird, {
        align: "center",
      });
      this.printText(
        tcText,
        this._profile.left_margin + innerWidthThird,
        this._profile.top_margin,
        {
          width: innerWidthThird,
          align: "center",
          links: true,
        }
      );

      //top right
      const trText = this.getCombinedContent(span?.positions?.["tr"]);
      const trTextHeight = this.getHeightOfText(trText, innerWidthThird, {
        align: "right",
      });
      this.printText(
        trText,
        this._profile.left_margin + innerWidthThird + innerWidthThird,
        this._profile.top_margin,
        {
          width: innerWidthThird,
          align: "right",
          links: true,
        }
      );

      //bottom left
      const blText = this.getCombinedContent(span?.positions?.["bl"]);
      const blTextHeight = this.getHeightOfText(blText, innerWidthHalf, {
        align: "left",
      });
      this.printText(
        blText,
        this._profile.left_margin,
        this._profile.top_margin + innerHeight - blTextHeight,
        {
          width: innerWidthHalf,
          align: "left",
          links: true,
        }
      );

      //bottom right
      const brText = this.getCombinedContent(span?.positions?.["br"]);
      const brTextHeight = this.getHeightOfText(brText, innerWidthHalf, {
        align: "right",
      });
      this.printText(
        brText,
        this._profile.left_margin + innerWidthHalf,
        this._profile.top_margin + innerHeight - brTextHeight,
        {
          width: innerWidthHalf,
          align: "right",
          links: true,
        }
      );

      //center center
      const topHeight = Math.max(tlTextHeight, tcTextHeight, trTextHeight, 0);
      const bottomHeight = Math.max(blTextHeight, brTextHeight, 0);

      const ccText = this.getCombinedContent(span?.positions?.["cc"]);
      const ccTextHeight = this.getHeightOfText(ccText, innerWidth, {
        align: "center",
      });
      const centerStart =
        this._profile.top_margin +
        (innerHeight - topHeight - bottomHeight) / 2 -
        ccTextHeight / 2;
      this.printText(ccText, this._profile.left_margin, centerStart, {
        width: innerWidth,
        align: "center",
        links: true,
      });

      return true;
    }
    return false;
  }

  printHeader(span: MetaLayout): void {
    const header = span?.positions?.["header"];
    if (header) {
      const headerText = header.flatMap((l) => l.content);
      this.printText(
        headerText,
        this._profile.left_margin,
        this._profile.page_number_top_margin - this._state.fontHeight,
        {
          color: "#777777",
        }
      );
    }
  }

  printFooter(span: MetaLayout): void {
    const footer = span?.positions?.["footer"];
    if (footer) {
      const footerText = footer.flatMap((l) => l.content);
      this.printText(
        footerText,
        this._profile.left_margin,
        this._profile.page_height - this._profile.page_footer_bottom_margin,
        {
          color: "#777777",
        }
      );
    }
  }

  printWatermark(span: MetaLayout): void {
    const watermark = span?.positions?.["watermark"];
    if (watermark) {
      const watermarkText = watermark.flatMap((l) => l.content);
      const watermarkString = watermarkText.map((c) => c.text).join("");
      const options = {
        origin: [0, 0],
      };
      const angle =
        (Math.atan(this._profile.page_height / this._profile.page_width) *
          180) /
        Math.PI;
      // underline and rotate pdfkit bug (?) workaround
      // un-format
      const len = watermarkString.length;
      let diagonal;
      diagonal = Math.sqrt(
        Math.pow(this._profile.page_width, 2) +
          Math.pow(this._profile.page_height, 2)
      );
      diagonal -= 4;
      const font_size = ((1.667 * diagonal) / len) * PDF_POINTS_PER_INCH;
      this._doc.fillColor(this.profile.settings?.watermark?.color ?? "#eeeeee");
      this._doc.fontSize(font_size);
      this._doc.rotate(angle, options);
      this._doc.text(
        watermarkString,
        2 * PDF_POINTS_PER_INCH,
        -(font_size / 2),
        {
          lineBreak: false,
        }
      );
      this._doc.rotate(-angle, options);
      this._doc.fontSize(this._profile.font_size ?? 12);
      this._doc.fillColor(this.profile.color ?? "#000000");
    }
  }

  printLine(span: PageLine) {
    let feed = this.getLineLeftMargin(span);
    const maxWidth = this.getLineMaxWidth(span);
    for (const group of this.getAlignedGroups(span)) {
      let content = group.content;

      const textOptions: TextOptions = {
        width: maxWidth,
        align: group.align,
      };

      if (span.level != null) {
        let headingText = span.content?.map((c) => c.text).join("") || "";
        const levelIndent = span.tag
          ? this._profile?.settings?.[span.tag]?.level_indent ?? 0
          : 0;
        feed += span.level * levelIndent;
        if (this._config?.screenplay_print_bookmarks) {
          if (this._doc.outline) {
            const oc = this.getOutlineChild(
              this._doc.outline,
              (span.level || 0) - 1,
              0
            );
            if (oc !== undefined) {
              oc.addItem(headingText);
            }
          }
        }
        this._state.outlineDepth = span.level;
        if (!this._config?.screenplay_print_headings) {
          content = [];
        }
      }

      if (span.scene != null) {
        if (this._config?.screenplay_print_bookmarks) {
          if (this._doc.outline) {
            this.getOutlineChild(
              this._doc.outline,
              this._state.outlineDepth,
              0
            ).addItem(content.map((c) => c.text).join(""));
          }
        }
        const sceneNumber = String(span.scene);
        const sceneNumberWidth = sceneNumber.length * this._state.fontWidth;
        const sceneTextOptions = { ...textOptions };
        if (this._config?.screenplay_print_scene_headers_bold) {
          sceneTextOptions.bold = true;
        }
        if (
          this._config?.screenplay_print_scene_numbers === "both" ||
          this._config?.screenplay_print_scene_numbers === "left"
        ) {
          const gap = 4 * this._state.fontWidth;
          const sceneNumberX =
            this._profile.left_margin - gap - sceneNumberWidth;
          this.printText(
            [{ text: sceneNumber }],
            sceneNumberX,
            this._state.y,
            sceneTextOptions
          );
        }
        if (
          this._config?.screenplay_print_scene_numbers === "both" ||
          this._config?.screenplay_print_scene_numbers === "right"
        ) {
          const gap = 1 * this._state.fontWidth;
          const sceneNumberX =
            this._profile.page_width - this._profile.right_margin + gap;
          this.printText(
            [{ text: sceneNumber }],
            sceneNumberX,
            this._state.y,
            sceneTextOptions
          );
        }
      }

      if (content.length > 0) {
        const height = this.printText(
          content,
          feed,
          this._state.y,
          textOptions
        );
        this._state.y += height;
        return height;
      }
    }
    return 0;
  }

  getHeightOfLines(lines: PageLine[]) {
    let height = 0;
    for (const line of lines) {
      height += this.getHeightOfLine(line);
    }
    return height;
  }

  printLines(lines: PageLine[]) {
    let height = 0;
    for (const line of lines) {
      height += this.printLine(line);
    }
    return height;
  }

  breakLineAfter(
    minLineCount: number,
    line: PageLine | undefined
  ): [PageLine[], PageLine[]] {
    if (!line) {
      return [[], []];
    }
    const width = this.getLineMaxWidth(line);
    const wrappedLines = this.wrapText(line.content, width).map((l) => ({
      tag: line.tag,
      content: l.texts,
    }));

    if (minLineCount) {
      const linesBeforeBreak = wrappedLines.slice(0, minLineCount);
      const linesAtAndAfterBreak = wrappedLines.slice(minLineCount);
      return [linesBeforeBreak, linesAtAndAfterBreak];
    }
    return [[], wrappedLines];
  }

  breakLines(lines: PageLine[]): [PageLine[], PageLine[]] {
    const nextPossibleBreakIndex = lines.findIndex((l) => l.canSplitAfter);
    if (nextPossibleBreakIndex >= 0) {
      const linesBeforeBreak = lines.slice(0, nextPossibleBreakIndex);
      const lineAtBreak = lines[nextPossibleBreakIndex];
      const allowSplitAfter = lineAtBreak?.canSplitAfter ?? 0;
      const [wrappedLinesBeforeBreak, wrappedLinesAfterBreak] =
        this.breakLineAfter(allowSplitAfter, lineAtBreak);
      const linesAfterBreak = lines.slice(nextPossibleBreakIndex + 1);

      const MORE =
        this._config?.screenplay_print_dialogue_more?.trim() || "(MORE)";
      const CONTD =
        this._config?.screenplay_print_dialogue_contd?.trim() || "(CONT'D)";

      const linesToAddBeforeSplit =
        lineAtBreak?.tag === "dialogue_content"
          ? [this.createLineWithText("more", MORE, this._profile)]
          : [];

      const linesToRepeatAfterSplit =
        lineAtBreak?.tag === "dialogue_content"
          ? lines
              .filter((l) => l.repeatAfterSplit)
              .map((l) =>
                this.suffixLineWithText(l, " " + CONTD, this._profile)
              )
          : [];

      const before = [...linesBeforeBreak, ...wrappedLinesBeforeBreak];

      const after = [...wrappedLinesAfterBreak, ...linesAfterBreak];

      if (before.length > 0 && after.length > 0) {
        before.push(...linesToAddBeforeSplit);
        after.unshift(...linesToRepeatAfterSplit);
      }

      return [before, after];
    }
    return [[], lines];
  }

  printBlockOfLinesAcrossPages(lines: PageLine[]) {
    let height = 0;
    if (lines.length > 0) {
      if (this._state.y + this.getHeightOfLines(lines) <= this.getMaxY()) {
        // block can fit on the page
        height += this.printLines(lines);
      } else {
        // block is too large to fit on the page
        // so try to find a preferred spot to break the block into two
        const [linesBeforeBreak, linesAfterBreak] = this.breakLines(lines);
        if (
          this._state.y + this.getHeightOfLines(linesBeforeBreak) <=
          this.getMaxY()
        ) {
          // lines before the break will fit on the page
          height += this.printLines(linesBeforeBreak);
          this.addPage();
          height += this.printBlockOfLinesAcrossPages(linesAfterBreak);
        } else {
          // lines before the break are too long to fit on the page
          // so force all lines to the next page
          this.addPage();
          if (this._state.lastForciblyDeferredLines !== lines) {
            this._state.lastForciblyDeferredLines = lines;
            height += this.printBlockOfLinesAcrossPages(lines);
          } else {
            // we are attempting to force the same lines to a new page again,
            // so to prevent an infinite loop,
            // just let the lines overflow the page and then force a page break
            // (this should only ever happen for extremely long unsplittable blocks)
            height += this.printLines(lines);
            this.addPage();
          }
        }
      }
    }
    return height;
  }

  getMetaSpan() {
    // First span is always meta layout
    return this._spans[0]?.tag === "meta" ? this._spans[0] : undefined;
  }

  getBodySpans() {
    // First span is always meta layout, so skip it
    return this._spans.slice(1);
  }

  getMaxY() {
    return this._profile.page_height - this._profile.bottom_margin;
  }

  getLineLeftMargin(line: PageLine) {
    const tagSettingMargin =
      line.position === "l"
        ? this._profile.settings[line.tag]?.dual_first_left_margin
        : line.position === "r"
        ? this._profile.settings[line.tag]?.dual_second_left_margin
        : this._profile.settings[line.tag]?.left_margin;
    return tagSettingMargin ?? this._profile.left_margin ?? 0;
  }

  getLineRightMargin(line: PageLine) {
    const tagSettingMargin =
      line.position === "l"
        ? this._profile.settings[line.tag]?.dual_first_right_margin
        : line.position === "r"
        ? this._profile.settings[line.tag]?.dual_second_right_margin
        : this._profile.settings[line.tag]?.right_margin;
    return tagSettingMargin ?? this._profile.right_margin ?? 0;
  }

  getLineMaxWidth(line: PageLine) {
    return (
      this._profile.page_width -
      this.getLineLeftMargin(line) -
      this.getLineRightMargin(line)
    );
  }

  getHeightOfLine(span: PageLine) {
    let height = 0;
    if (span.content) {
      const maxWidth = this.getLineMaxWidth(span);
      for (const group of this.getAlignedGroups(span)) {
        let content = group.content;
        const textOptions: TextOptions = {
          width: maxWidth,
          align: group.align,
        };
        height += this.getHeightOfText(content, maxWidth, textOptions);
      }
    }
    return height;
  }

  getIndentation(text: string): string {
    const match = (text || "").match(REGEX_INDENT);
    return match?.[0] || "";
  }

  getBlankedText(text: string): string {
    return (text || "").replace(REGEX_ANY_CHAR, " ");
  }

  getContentWithFonts(
    content: FormattedText[],
    options: TextOptions = {}
  ): FormattedText[] {
    return content.map((c) => {
      const augmented = {
        ...options,
        ...c,
      };
      augmented.font =
        augmented.font ??
        (augmented.bold && augmented.italic
          ? "bolditalic"
          : augmented.bold
          ? "bold"
          : augmented.italic
          ? "italic"
          : "normal");
      return augmented;
    });
  }

  getCombinedContent(lines: PageLine[] | undefined) {
    if (!lines) {
      return [];
    }
    const content: FormattedText[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      content.push(...line.content);
      if (i !== lines.length - 1) {
        content.push({ text: "\n" });
      }
    }
    return content;
  }

  createLineWithText(
    tag: ScreenplayTokenType,
    text: string,
    print: PrintProfile | undefined
  ) {
    return {
      tag: tag,
      content: [
        {
          text,
          color: print?.settings?.[tag]?.color,
          italic: print?.settings?.[tag]?.italic,
          align: print?.settings?.[tag]?.align,
        },
      ],
    };
  }

  suffixLineWithText(
    line: PageLine,
    text: string,
    print: PrintProfile | undefined
  ) {
    if (line.content.at(-1)?.text === text) {
      // already suffixed with text, so no need to do anything
      return line;
    }
    return {
      ...line,
      content: [
        ...line.content,
        {
          text,
          color: print?.settings?.[line.tag]?.color,
          italic: print?.settings?.[line.tag]?.italic,
          align: print?.settings?.[line.tag]?.align,
        },
      ],
    };
  }

  getAlignedGroups(line: PageLine) {
    const alignedGroups: {
      align?: string;
      content: FormattedText[];
    }[] = [];
    for (const textbox of line.content) {
      const currGroup = alignedGroups.at(-1);
      if (currGroup && textbox.align === currGroup.align) {
        currGroup.content.push(textbox);
      } else {
        alignedGroups.push({
          align: textbox.align,
          content: [textbox],
        });
      }
    }
    return alignedGroups;
  }

  getOutlineChild(
    obj: PDFKit.PDFOutline,
    targetDepth: number,
    currentDepth: number
  ): PDFKit.PDFOutline {
    if (currentDepth === targetDepth) {
      return obj;
    }
    if (obj.children.length > 0) {
      //get the last child
      currentDepth++;
      const child = obj.children[obj.children.length - 1];
      if (child) {
        return this.getOutlineChild(child, targetDepth, currentDepth);
      }
    }
    return obj;
  }

  printText(
    text: string | FormattedText[],
    x: number,
    y: number,
    options: TextOptions = {}
  ): number {
    const width =
      options?.width ??
      this._profile.page_width -
        this._profile.left_margin -
        this._profile.right_margin;
    const content = typeof text === "string" ? [{ text }] : text;
    const contentWithFonts = this.getContentWithFonts(content, options);

    if (options?.highlight) {
      // sizes specified in inches must be converted to PDF points (72 per inch)
      this._doc.highlight(
        x * PDF_POINTS_PER_INCH,
        y * PDF_POINTS_PER_INCH + this._doc.currentLineHeight() / 2,
        this._doc.widthOfString(contentWithFonts.map((c) => c.text).join("")),
        this._doc.currentLineHeight(),
        { color: options?.highlightColor }
      );
    }

    // sizes specified in inches must be converted to PDF points (72 per inch)
    printTextbox(
      this._doc,
      contentWithFonts,
      x * PDF_POINTS_PER_INCH,
      y * PDF_POINTS_PER_INCH,
      width * PDF_POINTS_PER_INCH,
      {
        ...options,
        baseline: "top",
      }
    );

    return this.getHeightOfText(content, width, options);
  }

  getWidthOfText(content: FormattedText[], options: TextOptions = {}): number {
    const contentWithFonts = this.getContentWithFonts(content, options);
    // sizes specified in inches must be converted to PDF points (72 per inch) and then converted back to inches
    return getWidthOfTextbox(this._doc, contentWithFonts) / PDF_POINTS_PER_INCH;
  }

  getHeightOfText(
    content: FormattedText[],
    width: number = 1,
    options: TextOptions = {}
  ): number {
    const contentWithFonts = this.getContentWithFonts(content, options);
    // sizes specified in inches must be converted to PDF points (72 per inch) and then converted back to inches
    return (
      getHeightOfTextbox(
        this._doc,
        contentWithFonts,
        width * PDF_POINTS_PER_INCH,
        {
          ...options,
          baseline: "top",
        }
      ) / PDF_POINTS_PER_INCH
    );
  }

  wrapText(content: FormattedText[], width: number, options: TextOptions = {}) {
    const contentWithFonts = this.getContentWithFonts(content, options);
    // sizes specified in inches must be converted to PDF points (72 per inch)
    return wrapTextbox(
      this._doc,
      contentWithFonts,
      width * PDF_POINTS_PER_INCH,
      {
        ...options,
        baseline: "top",
      }
    );
  }

  incrementProgress() {
    const progressTotal = this._spans.length;
    this._state.progressIndex += 1;
    this._onProgress?.((this._state.progressIndex / progressTotal) * 100);
  }

  private createNewState(): ScreenplayPrinterState {
    return {
      progressIndex: 0,
      fontHeight: 0,
      fontWidth: 0,
      outlineDepth: 0,
      pageNumber: 0,
      y: this._profile.top_margin,
      lastForciblyDeferredLines: undefined,
    };
  }
}
