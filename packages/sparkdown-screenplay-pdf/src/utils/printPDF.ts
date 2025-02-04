import PDFKit from "pdfkit";
import {
  MetaLayout,
  PageLine,
} from "../../../sparkdown-screenplay/src/types/DocumentSpan";
import { FormattedText } from "../../../sparkdown-screenplay/src/types/FormattedText";
import { PdfData } from "../../../sparkdown-screenplay/src/types/PdfData";
import { TextOptions } from "../../../sparkdown-screenplay/src/types/TextOptions";
import { printTextbox } from "../textbox-for-pdfkit/src/utils/printTextbox";

const SIZE_FACTOR = 72;
const DEFAULT_COLOR = "#000000";
const REGEX_INDENT = /^(\s+)/;
const REGEX_ANY_CHAR = /./g;

const getIndentation = (text: string): string => {
  const match = (text || "").match(REGEX_INDENT);
  return match?.[0] || "";
};

const blankText = (text: string): string => {
  return (text || "").replace(REGEX_ANY_CHAR, " ");
};

export const printPDF = (
  doc: PDFKit.PDFDocument,
  data: PdfData,
  onProgress?: (percentage: number) => void
): void => {
  const spans = data?.spans;
  const print = data?.print;
  const config = data?.config;
  const innerWidth = print.page_width - print.left_margin - print.right_margin;

  const progressTotal = spans.length;
  let progressIndex = 0;

  const incrementProgress = () => {
    progressIndex += 1;
    onProgress?.((progressIndex / progressTotal) * 100);
  };

  const printText = (
    content: FormattedText[],
    x: number,
    y: number,
    options?: TextOptions | undefined,
    settings?: { sizeFactor?: number; defaultColor?: string }
  ): void => {
    const pageWidth = data?.print?.page_width;
    const width =
      options?.width !== undefined ? options?.width : pageWidth || 0;
    const color = options?.color ?? settings?.defaultColor ?? DEFAULT_COLOR;
    const contentWithFonts = content.map((c) => ({
      ...c,
      font:
        c.font ??
        (c.bold && c.italic
          ? "bolditalic"
          : c.bold
          ? "bold"
          : c.italic
          ? "italic"
          : "normal"),
    }));

    doc.fill(color);

    if (options?.highlight) {
      doc.highlight(
        x * SIZE_FACTOR,
        y * SIZE_FACTOR + doc.currentLineHeight() / 2,
        doc.widthOfString(contentWithFonts.map((c) => c.text).join("")),
        doc.currentLineHeight(),
        { color: options?.highlightColor }
      );
    }

    printTextbox(
      doc,
      contentWithFonts,
      x * SIZE_FACTOR,
      y * SIZE_FACTOR,
      width * SIZE_FACTOR,
      {
        lineBreak: options?.lineBreak,
        align: options?.align,
        baseline: "top",
      }
    );
  };

  const printTitle = (span: MetaLayout) => {
    if (config?.screenplay_print_title_page && span?.positions) {
      const innerHeight = print.page_height - print.top_margin;
      const innerWidthThird = innerWidth / 3;
      const innerWidthHalf = innerWidth / 2;
      //top left
      const tlText =
        span?.positions?.["tl"]?.flatMap((l) => [
          ...l.content,
          { text: "\n" },
        ]) || [];
      const tlTextHeight = doc.heightOfString(
        tlText.map((c) => c.text).join(""),
        {
          width: innerWidthThird * SIZE_FACTOR,
          align: "left",
        }
      );
      printText(tlText, print.left_margin, print.top_margin, {
        width: innerWidthThird,
        align: "left",
        links: true,
      });

      //top center
      const tcText =
        span?.positions?.["tc"]?.flatMap((l) => [
          ...l.content,
          { text: "\n" },
        ]) || [];
      const tcTextHeight = doc.heightOfString(
        tcText.map((c) => c.text).join(""),
        {
          width: innerWidthThird * SIZE_FACTOR,
          align: "center",
        }
      );
      printText(tcText, print.left_margin + innerWidthThird, print.top_margin, {
        width: innerWidthThird,
        align: "center",
        links: true,
      });

      //top right
      const trText =
        span?.positions?.["tr"]?.flatMap((l) => [
          ...l.content,
          { text: "\n" },
        ]) || [];
      const trTextHeight = doc.heightOfString(
        trText.map((c) => c.text).join(""),
        {
          width: innerWidthThird * SIZE_FACTOR,
          align: "right",
        }
      );
      printText(
        trText,
        print.left_margin + innerWidthThird + innerWidthThird,
        print.top_margin,
        {
          width: innerWidthThird,
          align: "right",
          links: true,
        }
      );

      //bottom left
      const blText =
        span?.positions?.["bl"]?.flatMap((l) => [
          ...l.content,
          { text: "\n" },
        ]) || [];
      const blTextHeight = doc.heightOfString(
        blText.map((c) => c.text).join(""),
        {
          width: innerWidthHalf * SIZE_FACTOR,
          align: "left",
        }
      );
      printText(
        blText,
        print.left_margin,
        innerHeight - blTextHeight / SIZE_FACTOR,
        {
          width: innerWidthHalf,
          align: "left",
          links: true,
        }
      );

      //bottom right
      const brText =
        span?.positions?.["br"]?.flatMap((l) => [
          ...l.content,
          { text: "\n" },
        ]) || [];
      const brTextHeight = doc.heightOfString(
        brText.map((c) => c.text).join(""),
        {
          width: innerWidthHalf * SIZE_FACTOR,
          align: "right",
        }
      );
      printText(
        brText,
        print.left_margin + innerWidthHalf,
        innerHeight - brTextHeight / SIZE_FACTOR,
        {
          width: innerWidthHalf,
          align: "right",
          links: true,
        }
      );

      //center center
      const topHeight = Math.max(tlTextHeight, tcTextHeight, trTextHeight, 0);
      const bottomHeight = Math.max(blTextHeight, brTextHeight, 0);

      const ccText =
        span?.positions?.["cc"]?.flatMap((l) => [
          ...l.content,
          { text: "\n" },
        ]) || [];
      const ccTextHeight = doc.heightOfString(
        ccText.map((c) => c.text).join(""),
        {
          width: innerWidth * SIZE_FACTOR,
          align: "center",
        }
      );
      const centerStart =
        (innerHeight * SIZE_FACTOR - topHeight - bottomHeight) / 2 -
        ccTextHeight / 2;
      printText(ccText, print.left_margin, centerStart / SIZE_FACTOR, {
        width: innerWidth,
        align: "center",
        links: true,
      });

      // script
      doc.addPage();
    }
  };

  let y = 0;
  let page = 1;
  let sceneNumber: string;
  let prevSceneContinuationHeader = "";
  let currentSectionLevel = 0;

  const printHeaderAndFooter = (
    span: MetaLayout,
    continuation_header: string = ""
  ): void => {
    const header = span?.positions?.["header"];
    if (header) {
      let offset = blankText(continuation_header);
      const headerText = header.flatMap((l) => l.content);
      if (
        getIndentation(headerText.map((c) => c.text).join("")).length >=
        continuation_header.length
      ) {
        offset = "";
      }
      if (offset) {
        offset += " ";
      }
      printText(
        [{ text: offset }, ...headerText],
        1.5,
        print.page_number_top_margin - 0.1,
        {
          color: "#777777",
        }
      );
    }
    const footer = span?.positions?.["footer"];
    if (footer) {
      const footerText = footer.flatMap((l) => l.content);
      printText(footerText, 1.5, print.page_height - 0.5, {
        color: "#777777",
      });
    }
  };

  const printWatermark = (span: MetaLayout): void => {
    const watermark = span?.positions?.["watermark"];
    if (watermark) {
      const watermarkText = watermark.flatMap((l) => l.content);
      const options = {
        origin: [0, 0],
      };
      const angle =
        (Math.atan(print.page_height / print.page_width) * 180) / Math.PI;
      // underline and rotate pdfkit bug (?) workaround
      // un-format
      const len = watermarkText.map((c) => c.text).join("").length;
      let diagonal;
      diagonal = Math.sqrt(
        Math.pow(print.page_width, 2) + Math.pow(print.page_height, 2)
      );
      diagonal -= 4;
      const font_size = ((1.667 * diagonal) / len) * SIZE_FACTOR;
      doc.fontSize(font_size);
      doc.rotate(angle, options);
      printText(watermarkText, 2, -(font_size / 2) / SIZE_FACTOR, {
        color: "#eeeeee",
        lineBreak: false,
      });
      doc.rotate(-angle, options);
      doc.fontSize(print.font_size || 12);
    }
  };

  const getOutlineChild = (
    obj: PDFKit.PDFOutline,
    targetDepth: number,
    currentDepth: number
  ): PDFKit.PDFOutline => {
    if (currentDepth === targetDepth) {
      return obj;
    }
    if (obj.children.length > 0) {
      //get the last child
      currentDepth++;
      const child = obj.children[obj.children.length - 1];
      if (child) {
        return getOutlineChild(child, targetDepth, currentDepth);
      }
    }
    return obj;
  };

  const outline = doc.outline;
  let outlineDepth = 0;

  const metadataLayout = spans[0]?.tag === "meta" ? spans[0] : undefined;

  const printLine = (span: PageLine, offset: number = 0) => {
    if (span.tag === "page_break") {
      y = 0;
      doc.addPage();
      page++;

      const numberY = print.page_number_top_margin;

      if (config?.screenplay_print_page_numbers) {
        const pageNum = page.toFixed() + ".";
        const defaultFeed = print.settings.default?.feed ?? 0;
        const defaultMax = print.settings.default?.max ?? 0;
        const numberX =
          defaultFeed +
          defaultMax * print.font_width -
          pageNum.length * print.font_width;
        doc.font("normal");
        doc.text(pageNum, numberX * SIZE_FACTOR, numberY * SIZE_FACTOR);
      }
      if (metadataLayout) {
        printWatermark(metadataLayout);
        printHeaderAndFooter(metadataLayout, prevSceneContinuationHeader);
      }
      prevSceneContinuationHeader = "";
    } else if (span.tag === "separator") {
      y++;
    } else if (span.content) {
      const printSettings = print.settings[span.tag] ?? print.settings.default;
      const alignedGroups: { align?: string; content: FormattedText[] }[] = [];

      for (const textbox of span.content) {
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

      for (const alignedGroup of alignedGroups) {
        let content = alignedGroup.content;

        const textProperties: TextOptions = {
          color: printSettings?.color || DEFAULT_COLOR,
          highlight: false,
          bold: false,
          highlightColor: DEFAULT_COLOR,
          width:
            alignedGroup.align === "right" || alignedGroup.align === "center"
              ? innerWidth
              : undefined,
          align: alignedGroup.align,
        };

        if (content.length > 0) {
          let feed =
            print.settings[span.tag]?.feed ?? print.settings.default?.feed ?? 0;

          if (span.tag === "knot" || span.tag === "stitch") {
            let sectionText = span.content?.map((c) => c.text).join("") || "";
            currentSectionLevel = span.level || 0;
            const levelIndent = span.tag ? printSettings?.level_indent ?? 0 : 0;
            feed += currentSectionLevel * levelIndent;
            if (config?.screenplay_print_bookmarks) {
              if (outline) {
                const oc = getOutlineChild(outline, (span.level || 0) - 1, 0);
                if (oc !== undefined) {
                  oc.addItem(sectionText);
                }
              }
            }
            outlineDepth = span.level || 0;
          }

          if (span.scene != null) {
            if (config?.screenplay_print_bookmarks) {
              if (outline) {
                getOutlineChild(outline, outlineDepth, 0).addItem(
                  content.map((c) => c.text).join("")
                );
              }
            }
          }

          if (content.length > 0) {
            printText(
              content,
              feed + offset,
              print.top_margin + print.font_height * y,
              textProperties
            );
          }

          if (span.scene != null) {
            sceneNumber = String(span.scene);
            const sceneTextLength = sceneNumber.length;

            let shiftSceneNumber;

            if (
              config?.screenplay_print_scene_numbers === "both" ||
              config?.screenplay_print_scene_numbers === "left"
            ) {
              shiftSceneNumber = (sceneTextLength + 4) * print.font_width;
              printText(
                [{ text: sceneNumber }],
                feed - shiftSceneNumber,
                print.top_margin + print.font_height * y,
                textProperties
              );
            }

            if (
              config?.screenplay_print_scene_numbers === "both" ||
              config?.screenplay_print_scene_numbers === "right"
            ) {
              const sceneMax = print.settings.scene?.max ?? 0;
              shiftSceneNumber = (sceneMax + 1) * print.font_width;
              printText(
                [{ text: sceneNumber }],
                feed + shiftSceneNumber,
                print.top_margin + print.font_height * y,
                textProperties
              );
            }
          }
          y++;
        }
      }
    }
  };

  if (metadataLayout) {
    printTitle(metadataLayout);
    printWatermark(metadataLayout);
    printHeaderAndFooter(metadataLayout);
  }

  for (const span of spans) {
    if (span.tag === "meta") {
      // already printed title earlier
    } else if (span.tag === "split") {
      // print content split into two columns
      if (span.positions?.l || span.positions?.r) {
        const yStartLeft = y;
        if (span.positions?.l) {
          for (const leftSpan of span.positions.l) {
            printLine(leftSpan, print.left_margin * -0.5);
          }
        }
        const yEndLeft = y;
        y = yStartLeft;
        if (span.positions?.r) {
          for (const rightSpan of span.positions.r) {
            printLine(rightSpan, print.left_margin * 1.5);
          }
        }
        y = Math.max(yEndLeft, y);
      }
    } else {
      // print line of content
      printLine(span);
    }
    incrementProgress();
  }
};
