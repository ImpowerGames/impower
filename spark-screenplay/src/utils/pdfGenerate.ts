import { LineItem } from "../classes/Liner";
import { LineStruct } from "../types/LineStruct";
import { OutlineItem } from "../types/OutlineItem";
import { PdfData } from "../types/PdfData";
import { PdfDocument } from "../types/PdfDocument";
import { PrintableTokenType } from "../types/PrintProfile";
import { TextOptions } from "../types/TextOptions";
import { pdfVersionGenerator } from "./pdfVersionGenerator";

const REGEX_INDENT = /^(\s+)/;
const REGEX_ANY_CHAR = /./g;
const REGEX_ASTERISK_CHAR = /\*/g;
const REGEX_UNDERLINE_CHAR = /_/g;
const SIZE_FACTOR = 72;
const DEFAULT_COLOR = "#000000";

const getIndentation = (text: string): string => {
  const match = (text || "").match(REGEX_INDENT);
  return match?.[0] || "";
};

const blankText = (text: string): string => {
  return (text || "").replace(REGEX_ANY_CHAR, " ");
};

const sortByOrder = (a: { order: number }, b: { order: number }): number => {
  if (a.order === -1) {
    return 0;
  } else {
    return a.order - b.order;
  }
};

export const pdfGenerate = (
  doc: PdfDocument,
  data: PdfData,
  encode: (text: string) => string,
  lineStructs?: Record<number, LineStruct>
): void => {
  const titleTokens = data?.titleTokens;
  const lines = data?.lines;
  const print = data?.print;
  const config = data?.config;

  // helper
  const center = (txt: string, y: number): void => {
    const textLength = txt
      .replace(REGEX_ASTERISK_CHAR, "")
      .replace(REGEX_UNDERLINE_CHAR, "").length;
    const feed = (print.page_width - textLength * print.font_width) / 2;
    doc.processText?.(txt, feed, y);
  };

  if (config?.screenplay_print_title_page && titleTokens) {
    const innerWidth =
      print.page_width - print.right_margin - print.right_margin;
    const innerHeight = print.page_height - print.top_margin;
    const innerWidthThird = innerWidth / 3;
    const innerWidthHalf = innerWidth / 2;
    const joinChar = "\n\n";
    //top left
    const tlText =
      titleTokens?.["tl"]
        ?.sort(sortByOrder)
        ?.map((x: { text: string }) => x.text)
        ?.join(joinChar) || "";
    const tlTextHeight = doc.heightOfString(tlText, {
      width: innerWidthThird * SIZE_FACTOR,
      align: "left",
    });

    doc.processText?.(tlText, print.right_margin, print.top_margin, {
      width: innerWidthThird,
      align: "left",
      links: true,
    });

    //top center
    const tcText =
      titleTokens?.["tc"]
        ?.sort(sortByOrder)
        ?.map((x: { text: string }) => x.text)
        ?.join(joinChar) || "";
    const tcTextHeight = doc.heightOfString(tcText, {
      width: innerWidthThird * SIZE_FACTOR,
      align: "center",
    });
    doc.processText?.(
      tcText,
      print.right_margin + innerWidthThird,
      print.top_margin,
      {
        width: innerWidthThird,
        align: "center",
        links: true,
      }
    );

    //top right
    const trText =
      titleTokens?.["tr"]
        ?.sort(sortByOrder)
        ?.map((x: { text: string }) => x.text)
        ?.join(joinChar) || "";
    const trTextHeight = doc.heightOfString(trText, {
      width: innerWidthThird * SIZE_FACTOR,
      align: "right",
    });
    doc.processText?.(
      trText,
      print.right_margin + innerWidthThird + innerWidthThird,
      print.top_margin,
      {
        width: innerWidthThird,
        align: "right",
        links: true,
      }
    );

    //bottom left
    const blText =
      titleTokens?.["bl"]
        ?.sort(sortByOrder)
        ?.map((x: { text: string }) => x.text)
        ?.join(joinChar) || "";
    const blTextHeight = doc.heightOfString(blText, {
      width: innerWidthHalf * SIZE_FACTOR,
      align: "left",
    });
    doc.processText?.(
      blText,
      print.right_margin,
      innerHeight - blTextHeight / SIZE_FACTOR,
      {
        width: innerWidthHalf,
        align: "left",
        links: true,
      }
    );

    //bottom right
    const brText =
      titleTokens?.["br"]
        ?.sort(sortByOrder)
        ?.map((x: { text: string }) => x.text)
        ?.join(joinChar) || "";
    const brTextHeight = doc.heightOfString(brText, {
      width: innerWidthHalf * SIZE_FACTOR,
      align: "right",
    });
    doc.processText?.(
      brText,
      print.right_margin + innerWidthHalf,
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
      titleTokens?.["cc"]
        ?.sort(sortByOrder)
        ?.map((x: { text: string }) => x.text)
        ?.join(joinChar) || "";
    const ccTextHeight = doc.heightOfString(ccText, {
      width: innerWidth * SIZE_FACTOR,
      align: "center",
    });
    const centerStart =
      (innerHeight * SIZE_FACTOR - topHeight - bottomHeight) / 2 -
      ccTextHeight / 2;
    doc.processText?.(ccText, print.right_margin, centerStart / SIZE_FACTOR, {
      width: innerWidth,
      align: "center",
      links: true,
    });

    // script
    doc.addPage();
  }

  let y = 0;
  let page = 1;
  let sceneNumber: string;
  let prevSceneContinuationHeader = "";
  let currentSectionLevel = 0;
  let currentSectionNumber: string;
  let currentSectionToken: LineItem;
  let text: string;
  let afterSection = false;
  const sectionNumber = pdfVersionGenerator();

  const printHeaderAndFooter = (continuation_header?: string): void => {
    if (config?.screenplay_print_header) {
      continuation_header = continuation_header || "";
      let offset = blankText(continuation_header);
      if (
        getIndentation(config?.screenplay_print_header).length >=
        continuation_header.length
      ) {
        offset = "";
      }
      if (offset) {
        offset += " ";
      }

      doc.formatText?.(
        offset + config?.screenplay_print_header,
        1.5,
        print.page_number_top_margin - 0.1,
        {
          color: "#777777",
        }
      );
    }
    if (config?.screenplay_print_footer) {
      doc.formatText?.(
        config?.screenplay_print_footer,
        1.5,
        print.page_height - 0.5,
        {
          color: "#777777",
        }
      );
    }
  };

  const printWatermark = (): void => {
    if (config?.screenplay_print_watermark) {
      const options = {
        origin: [0, 0],
      };
      const angle =
        (Math.atan(print.page_height / print.page_width) * 180) / Math.PI;
      // underline and rotate pdfkit bug (?) workaround
      const watermark = config?.screenplay_print_watermark.replace(
        REGEX_UNDERLINE_CHAR,
        ""
      );
      // un-format
      const len = watermark.replace(REGEX_ASTERISK_CHAR, "").length;
      let diagonal;
      diagonal = Math.sqrt(
        Math.pow(print.page_width, 2) + Math.pow(print.page_height, 2)
      );
      diagonal -= 4;
      const font_size = ((1.667 * diagonal) / len) * SIZE_FACTOR;
      doc.fontSize(font_size);
      doc.rotate(angle, options);
      doc.formatText?.(watermark, 2, -(font_size / 2) / SIZE_FACTOR, {
        color: "#eeeeee",
        lineBreak: false,
      });
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
  let currentDuration = 0;
  lines.forEach((line: LineItem) => {
    if (line.type === "page_break") {
      if (lineStructs) {
        if (line.token?.line && !lineStructs[line.token?.line || -1]) {
          lineStructs[line.token.line] = {
            page: page,
            scene: currentScene,
            cumulativeDuration: currentDuration,
            sections: currentSections.slice(0),
          };
        }
      }

      y = 0;
      doc.addPage();
      page++;

      const numberY = print.page_number_top_margin;

      if (config?.screenplay_print_page_numbers) {
        const pageNum = page.toFixed() + ".";
        const numberX =
          print.action.feed +
          print.action.max * print.font_width -
          pageNum.length * print.font_width;
        doc.font(doc?.fontKeys?.normal || "normal");
        doc.text(pageNum, numberX * SIZE_FACTOR, numberY * SIZE_FACTOR);
      }
      printWatermark();
      printHeaderAndFooter(prevSceneContinuationHeader);
      prevSceneContinuationHeader = "";
    } else if (line.type === "separator") {
      y++;
      if (lineStructs) {
        if (line.token?.line && !lineStructs[line.token?.line]) {
          lineStructs[line.token.line] = {
            page: page,
            scene: currentScene,
            cumulativeDuration: currentDuration,
            sections: currentSections.slice(0),
          };
        }
      }
    } else {
      // formatting not supported yet
      text = line.text;

      const textProperties: TextOptions = {
        color: print?.[line.type as PrintableTokenType]?.color || DEFAULT_COLOR,
        highlight: false,
        bold: false,
        highlightColor: DEFAULT_COLOR,
      };

      if (line.type === "parenthetical" && !text.startsWith("(")) {
        text = " " + text;
      }

      if (line.type === "centered") {
        center(text, print.top_margin + print.font_height * y++);
      } else {
        let feed: number =
          (print[line.type as PrintableTokenType] || {}).feed ||
          print.action.feed;
        if (line.type === "transition") {
          feed =
            print.action.feed +
            print.action.max * print.font_width -
            line.text.length * print.font_width;
        }

        const invisibleSections =
          data.sceneInvisibleSections?.[line.scene || -1];
        const hasInvisibleSection =
          line.type === "scene" && invisibleSections !== undefined;
        const processSection = (sectionToken: LineItem): void => {
          let sectionText = sectionToken.text;
          currentSectionLevel = sectionToken.level || 0;
          currentSections.length = Math.max(0, (sectionToken.level || 0) - 1);

          currentSections.push(encode(sectionText));
          if (!hasInvisibleSection) {
            feed += currentSectionLevel * (print.section.level_indent || 0);
          }
          if (config?.screenplay_print_section_numbers) {
            if (sectionToken !== currentSectionToken) {
              currentSectionNumber = sectionNumber(sectionToken.level || 0);
              currentSectionToken = sectionToken;
              sectionText = currentSectionNumber + ". " + sectionText;
            } else {
              sectionText =
                Array(currentSectionNumber.length + 3).join(" ") + sectionText;
            }
          }
          if (config?.screenplay_print_bookmarks) {
            if (
              hasInvisibleSection &&
              !config?.screenplay_print_bookmarks_for_invisible_sections
            ) {
              return;
            }
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
          if (!hasInvisibleSection) {
            text = sectionText;
          }
          outlineDepth = sectionToken.level || 0;
        };
        if (line.type === "section" || hasInvisibleSection) {
          if (hasInvisibleSection) {
            for (let i = 0; i < invisibleSections.length; i++) {
              const invisibleSection = invisibleSections[i];
              if (invisibleSection) {
                processSection(invisibleSection);
              }
            }
          } else if (line.token) {
            processSection(line.token);
          }
        }

        if (line.type === "scene") {
          if (config?.screenplay_print_bookmarks) {
            if (outline) {
              getOutlineChild(outline, outlineDepth, 0).addItem(text);
            }
          }
          currentScene = text;
          if (config?.screenplay_print_scene_headers_bold) {
            text = "**" + text + "**";
          }
        }

        if (line.type === "synopsis") {
          feed += print.synopsis.padding || 0;
          if (print.synopsis.feed_with_last_section && afterSection) {
            feed += currentSectionLevel * (print.section.level_indent || 0);
          } else {
            feed = print.action.feed;
          }
        }

        if (
          print[line.type as PrintableTokenType] &&
          print[line.type as PrintableTokenType].italic &&
          text
        ) {
          text = "*" + text + "*";
        }

        if (line.token && line.token.position) {
          if (line.rightColumn) {
            let yRight = y;
            line.rightColumn.forEach((rightLine: LineItem) => {
              let feedRight =
                (print[rightLine.type as PrintableTokenType] || {}).feed ||
                print.action.feed;
              feedRight -= (feedRight - print.left_margin) / 2;
              feedRight +=
                (print.page_width - print.right_margin - print.left_margin) / 2;
              const right_text_properties = { ...textProperties };
              doc.processText?.(
                rightLine.text,
                feedRight,
                print.top_margin + print.font_height * yRight++,
                right_text_properties
              );
            });
          }
          feed -= (feed - print.left_margin) / 2;
        }

        doc.processText?.(
          text,
          feed,
          print.top_margin + print.font_height * y,
          textProperties
        );

        if (line.scene) {
          sceneNumber = String(line.scene);
          const sceneTextLength = sceneNumber.length;
          if (config?.screenplay_print_scene_headers_bold) {
            sceneNumber = "**" + sceneNumber + "**";
          }

          let shiftSceneNumber;

          if (
            config?.screenplay_print_scene_numbers === "both" ||
            config?.screenplay_print_scene_numbers === "left"
          ) {
            shiftSceneNumber = (sceneTextLength + 4) * print.font_width;
            doc.processText?.(
              sceneNumber,
              feed - shiftSceneNumber,
              print.top_margin + print.font_height * y,
              textProperties
            );
          }

          if (
            config?.screenplay_print_scene_numbers === "both" ||
            config?.screenplay_print_scene_numbers === "right"
          ) {
            shiftSceneNumber = (print.scene.max + 1) * print.font_width;
            doc.processText?.(
              sceneNumber,
              feed + shiftSceneNumber,
              print.top_margin + print.font_height * y,
              textProperties
            );
          }
        }
        y++;
      }
      if (lineStructs) {
        if (line.token?.line && !lineStructs[line.token.line]) {
          if (line.token?.duration) {
            currentDuration += line.token.duration;
          }
          lineStructs[line.token.line] = {
            page: page,
            scene: currentScene,
            sections: currentSections.slice(0),
            cumulativeDuration: currentDuration,
          };
        }
      }
    }

    // clear after section
    if (line.type === "section") {
      afterSection = true;
    } else if (
      line.type !== "separator" &&
      line.type !== "synopsis" &&
      line.type !== "page_break"
    ) {
      afterSection = false;
    }
  });
};
