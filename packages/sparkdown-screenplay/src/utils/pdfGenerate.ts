import { DocumentSpan } from "../types/DocumentSpan";
import { FormattedText } from "../types/FormattedText";
import { OutlineItem } from "../types/OutlineItem";
import { PdfData } from "../types/PdfData";
import { PdfDocument } from "../types/PdfDocument";
import { PrintableTokenType } from "../types/PrintProfile";
import { TextOptions } from "../types/TextOptions";
import { pdfVersionGenerator } from "./pdfVersionGenerator";

const REGEX_INDENT = /^(\s+)/;
const REGEX_ANY_CHAR = /./g;
const SIZE_FACTOR = 72;
const DEFAULT_COLOR = "#000000";

const getIndentation = (text: string): string => {
  const match = (text || "").match(REGEX_INDENT);
  return match?.[0] || "";
};

const blankText = (text: string): string => {
  return (text || "").replace(REGEX_ANY_CHAR, " ");
};

export const pdfGenerate = (
  doc: PdfDocument,
  data: PdfData,
  onProgress?: (percentage: number) => void
): void => {
  const frontMatterSpans = data?.frontMatterSpans;
  const bodySpans = data?.bodySpans;
  const print = data?.print;
  const config = data?.config;
  const innerWidth = print.page_width - print.left_margin - print.right_margin;

  const frontMatterPositionCount = 6;
  const progressTotal = frontMatterPositionCount + bodySpans.length;
  let progressIndex = 0;

  const incrementProgress = () => {
    progressIndex += 1;
    onProgress?.((progressIndex / progressTotal) * 100);
  };

  if (
    config?.screenplay_print_title_page &&
    Object.keys(frontMatterSpans).length > 0
  ) {
    const innerHeight = print.page_height - print.top_margin;
    const innerWidthThird = innerWidth / 3;
    const innerWidthHalf = innerWidth / 2;
    //top left
    const tlText = frontMatterSpans?.["tl"]?.content || [];
    const tlTextHeight = doc.heightOfString(
      tlText.map((c) => c.text).join(""),
      {
        width: innerWidthThird * SIZE_FACTOR,
        align: "left",
      }
    );
    doc.printText?.(tlText, print.left_margin, print.top_margin, {
      width: innerWidthThird,
      align: "left",
      links: true,
    });
    incrementProgress();

    //top center
    const tcText = frontMatterSpans?.["tc"]?.content || [];
    const tcTextHeight = doc.heightOfString(
      tcText.map((c) => c.text).join(""),
      {
        width: innerWidthThird * SIZE_FACTOR,
        align: "center",
      }
    );
    doc.printText?.(
      tcText,
      print.left_margin + innerWidthThird,
      print.top_margin,
      {
        width: innerWidthThird,
        align: "center",
        links: true,
      }
    );
    incrementProgress();

    //top right
    const trText = frontMatterSpans?.["tr"]?.content || [];
    const trTextHeight = doc.heightOfString(
      trText.map((c) => c.text).join(""),
      {
        width: innerWidthThird * SIZE_FACTOR,
        align: "right",
      }
    );
    doc.printText?.(
      trText,
      print.left_margin + innerWidthThird + innerWidthThird,
      print.top_margin,
      {
        width: innerWidthThird,
        align: "right",
        links: true,
      }
    );
    incrementProgress();

    //bottom left
    const blText = frontMatterSpans?.["bl"]?.content || [];
    const blTextHeight = doc.heightOfString(
      blText.map((c) => c.text).join(""),
      {
        width: innerWidthHalf * SIZE_FACTOR,
        align: "left",
      }
    );
    doc.printText?.(
      blText,
      print.left_margin,
      innerHeight - blTextHeight / SIZE_FACTOR,
      {
        width: innerWidthHalf,
        align: "left",
        links: true,
      }
    );
    incrementProgress();

    //bottom right
    const brText = frontMatterSpans?.["br"]?.content || [];
    const brTextHeight = doc.heightOfString(
      brText.map((c) => c.text).join(""),
      {
        width: innerWidthHalf * SIZE_FACTOR,
        align: "right",
      }
    );
    doc.printText?.(
      brText,
      print.left_margin + innerWidthHalf,
      innerHeight - brTextHeight / SIZE_FACTOR,
      {
        width: innerWidthHalf,
        align: "right",
        links: true,
      }
    );
    incrementProgress();

    //center center
    const topHeight = Math.max(tlTextHeight, tcTextHeight, trTextHeight, 0);
    const bottomHeight = Math.max(blTextHeight, brTextHeight, 0);

    const ccText = frontMatterSpans?.["cc"]?.content || [];
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
    doc.printText?.(ccText, print.left_margin, centerStart / SIZE_FACTOR, {
      width: innerWidth,
      align: "center",
      links: true,
    });
    incrementProgress();

    // script
    doc.addPage();
  }

  let y = 0;
  let page = 1;
  let sceneNumber: string;
  let prevSceneContinuationHeader = "";
  let currentSectionLevel = 0;
  let currentSectionNumber: string;
  let currentSectionToken: DocumentSpan;
  const sectionNumber = pdfVersionGenerator();

  const printHeaderAndFooter = (continuation_header?: string): void => {
    const header = frontMatterSpans["header"];
    if (header) {
      continuation_header = continuation_header || "";
      let offset = blankText(continuation_header);
      const headerText = header.content?.map((c) => c.text).join("") || "";
      if (getIndentation(headerText).length >= continuation_header.length) {
        offset = "";
      }
      if (offset) {
        offset += " ";
      }

      doc.printText?.(
        [{ text: offset + headerText }],
        1.5,
        print.page_number_top_margin - 0.1,
        {
          color: "#777777",
        }
      );
    }
    const footer = frontMatterSpans["footer"];
    if (footer) {
      const footerText = footer.content?.map((c) => c.text).join("") || "";
      if (footer) {
        doc.printText?.([{ text: footerText }], 1.5, print.page_height - 0.5, {
          color: "#777777",
        });
      }
    }
  };

  const printWatermark = (): void => {
    const watermark = frontMatterSpans["watermark"];
    if (watermark) {
      const watermarkText =
        watermark.content?.map((c) => c.text).join("") || "";
      const options = {
        origin: [0, 0],
      };
      const angle =
        (Math.atan(print.page_height / print.page_width) * 180) / Math.PI;
      // underline and rotate pdfkit bug (?) workaround
      // un-format
      const len = watermarkText.length;
      let diagonal;
      diagonal = Math.sqrt(
        Math.pow(print.page_width, 2) + Math.pow(print.page_height, 2)
      );
      diagonal -= 4;
      const font_size = ((1.667 * diagonal) / len) * SIZE_FACTOR;
      doc.fontSize(font_size);
      doc.rotate(angle, options);
      doc.printText?.(
        [{ text: watermarkText }],
        2,
        -(font_size / 2) / SIZE_FACTOR,
        {
          color: "#eeeeee",
          lineBreak: false,
        }
      );
      doc.rotate(-angle, options);
      doc.fontSize(print.font_size || 12);
    }
  };

  const getOutlineChild = (
    obj: OutlineItem,
    targetDepth: number,
    currentDepth: number
  ): OutlineItem => {
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
  // let previousSectionDepth = 0;

  printWatermark();
  printHeaderAndFooter();

  let currentScene = "";
  const currentSections: string[] = [];

  const printSpanContent = (span: DocumentSpan, offset: number = 0) => {
    if (span.tag === "page_break") {
      y = 0;
      doc.addPage();
      page++;

      const numberY = print.page_number_top_margin;

      if (config?.screenplay_print_page_numbers) {
        const pageNum = page.toFixed() + ".";
        const numberX =
          print.settings.action.feed +
          print.settings.action.max * print.font_width -
          pageNum.length * print.font_width;
        doc.font("normal");
        doc.text(pageNum, numberX * SIZE_FACTOR, numberY * SIZE_FACTOR);
      }
      printWatermark();
      printHeaderAndFooter(prevSceneContinuationHeader);
      prevSceneContinuationHeader = "";
    } else if (span.tag === "separator") {
      y++;
    } else if (span.content) {
      const alignedGroups: { align?: string; content: FormattedText[] }[] = [];
      span.content.forEach((textbox) => {
        const currGroup = alignedGroups.at(-1);
        if (currGroup && textbox.align === currGroup.align) {
          currGroup.content.push(textbox);
        } else {
          alignedGroups.push({
            align: textbox.align,
            content: [textbox],
          });
        }
      });

      alignedGroups.forEach((alignedGroup) => {
        let content = alignedGroup.content;

        const textProperties: TextOptions = {
          color:
            print.settings[span.tag as PrintableTokenType]?.color ||
            DEFAULT_COLOR,
          highlight: false,
          bold: false,
          highlightColor: DEFAULT_COLOR,
          width:
            alignedGroup.align === "right" || alignedGroup.align === "center"
              ? innerWidth
              : undefined,
        };

        if (content.length > 0) {
          let feed =
            (print.settings[span.tag as PrintableTokenType] || {}).feed ||
            print.settings.action.feed;

          const processSection = (sectionToken: DocumentSpan): void => {
            let sectionText =
              sectionToken.content?.map((c) => c.text).join("") || "";
            currentSectionLevel = sectionToken.level || 0;
            currentSections.length = Math.max(0, (sectionToken.level || 0) - 1);

            currentSections.push(sectionText);
            feed +=
              currentSectionLevel * (print.settings.section.level_indent || 0);
            if (config?.screenplay_print_section_numbers) {
              if (sectionToken !== currentSectionToken) {
                currentSectionNumber = sectionNumber(sectionToken.level || 0);
                currentSectionToken = sectionToken;
                sectionText = currentSectionNumber + ". " + sectionText;
              } else {
                sectionText =
                  Array(currentSectionNumber.length + 3).join(" ") +
                  sectionText;
              }
            }
            if (config?.screenplay_print_bookmarks) {
              if (outline) {
                const oc = getOutlineChild(
                  outline,
                  (sectionToken.level || 0) - 1,
                  0
                );
                if (oc !== undefined) {
                  oc.addItem(sectionText);
                }
              }
            }
            content = [{ text: sectionText }];
            outlineDepth = sectionToken.level || 0;
          };

          if (span.tag === "section") {
            processSection(span);
          }

          if (span.tag === "scene") {
            if (config?.screenplay_print_bookmarks) {
              if (outline) {
                getOutlineChild(outline, outlineDepth, 0).addItem(
                  content.map((c) => c.text).join("")
                );
              }
            }
            currentScene = content.map((c) => c.text).join("");
          }

          doc.printText?.(
            content,
            feed + offset,
            print.top_margin + print.font_height * y,
            textProperties
          );

          if (span.scene) {
            sceneNumber = String(span.scene);
            const sceneTextLength = sceneNumber.length;

            let shiftSceneNumber;

            if (
              config?.screenplay_print_scene_numbers === "both" ||
              config?.screenplay_print_scene_numbers === "left"
            ) {
              shiftSceneNumber = (sceneTextLength + 4) * print.font_width;
              doc.printText?.(
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
              shiftSceneNumber =
                (print.settings.scene.max + 1) * print.font_width;
              doc.printText?.(
                [{ text: sceneNumber }],
                feed + shiftSceneNumber,
                print.top_margin + print.font_height * y,
                textProperties
              );
            }
          }
          y++;
        }
      });
    }
  };

  bodySpans.forEach((span: DocumentSpan) => {
    if (span.leftColumn || span.rightColumn) {
      const yStartLeft = y;
      if (span.leftColumn) {
        span.leftColumn.forEach((leftSpan) => {
          printSpanContent(leftSpan, print.left_margin * -0.5);
        });
      }
      const yEndLeft = y;
      y = yStartLeft;
      if (span.rightColumn) {
        span.rightColumn.forEach((rightSpan: DocumentSpan) => {
          printSpanContent(rightSpan, print.left_margin * 1.5);
        });
      }
      y = Math.max(yEndLeft, y);
    } else {
      printSpanContent(span);
    }
    incrementProgress();
  });
};
