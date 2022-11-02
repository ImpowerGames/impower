// TODO: Extract pdfmaker to a separate library (+++++)
import { encode } from "html-entities";
import pdfkit from "pdfkit";
import * as vscode from "vscode";
import {
  PrintableTokenType,
  PrintProfile,
  SparkScreenplayConfig
} from "../../../spark-screenplay";
import {
  SparkParseResult,
  sparkRegexes,
  SparkSectionToken,
  SparkToken
} from "../../../sparkdown";
import { LineItem } from "./liner";
import { PdfWriteStream } from "./PDFWriteStream";
const addTextbox = require("textbox-for-pdfkit");

export interface OutlineItem {
  children: OutlineItem[];
  addItem: (item: string) => void;
}

export type TextOptions = PDFKit.Mixins.TextOptions & {
  color?: string;
  bold?: boolean;
  lineBreak?: boolean;
  highlight?: boolean;
  highlightColor?: string;
  links?: boolean;
};

export type PdfDocument = typeof pdfkit & {
  outline?: OutlineItem;
  resetFormat?: () => void;
  simpleText?: (
    text: string,
    x?: number,
    y?: number,
    options?: TextOptions
  ) => void;
  formatText?: (
    text: string,
    x: number,
    y: number,
    options?: TextOptions
  ) => void;
  text2?: (text: string, x: number, y: number, options?: TextOptions) => void;
  text2WithImages?: (
    text: string,
    x: number,
    y: number,
    options?: TextOptions
  ) => void;
  formatState?: {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    overrideColor?: string;
  };
};

export interface PdfOptions {
  filepath: string;
  parsed: SparkParseResult;
  lines: LineItem[];
  print: PrintProfile;
  font: string;
  fonts: Record<string, Uint8Array | undefined>;
  sceneInvisibleSections: Record<string | number, SparkSectionToken[]>;
  screenplayConfig?: SparkScreenplayConfig;
  hooks?: {
    beforeScript: (doc: PdfDocument) => void;
  };
}

export interface LineStruct {
  sections: string[];
  scene: string;
  page: number;
  cumulativeDuration: number;
}

export interface PdfStats {
  pageCount: number;
  pageCountReal: number;
  lineMap: Record<number, LineStruct>; //the structure of each line
}

export const versionGenerator = (
  current?: string
): ((level?: number) => string) => {
  current = current || "0";

  const numbers: number[] = current
    .split(".")
    .map((x) => Number(x))
    .concat([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

  const bump = (level: number): void => {
    numbers[level - 1]++;
    for (let i = level; i < numbers.length; i++) {
      numbers[i] = 0;
    }
  };

  const toStr = (): string => {
    const copy = numbers.concat();
    copy.reverse();
    while (copy.length > 1 && copy[0] === 0) {
      copy.shift();
    }
    copy.reverse();
    return copy.join(".");
  };

  const increase = (level?: number): string => {
    if (level === undefined) {
      return toStr();
    }
    bump(level);
    return toStr();
  };

  return increase;
};

const getIndentation = (text: string): string => {
  const match = (text || "").match(/^(\s+)/);
  return match?.[0] || "";
};

const blankText = (text: string): string => {
  return (text || "").replace(/./g, " ");
};

const sortByOrder = (a: { order: number }, b: { order: number }): number => {
  if (a.order === -1) {
    return 0;
  } else {
    return a.order - b.order;
  }
};

const initDoc = async (opts: PdfOptions): Promise<PdfDocument> => {
  const print = opts.print;
  const options = {
    font: opts.font,
    compress: false,
    size: print.paper_size === "a4" ? "A4" : "LETTER",
    margins: {
      top: 0,
      left: 0,
      bottom: 0,
      right: 0,
    },
  };
  const doc: PdfDocument = new pdfkit(options);

  //Load Courier Prime by default, and replace the variants if requested and available
  Object.entries(opts.fonts).forEach(([key, src]) => {
    if (src) {
      doc.registerFont(key, src);
    }
  });

  doc.font("ScriptNormal");
  doc.fontSize(print.font_size || 12);

  // convert points to inches for text
  doc.resetFormat = (): void => {
    doc.formatState = {
      bold: false,
      italic: false,
      underline: false,
    };
  };
  doc.resetFormat();
  doc.simpleText = (
    text: string,
    x?: number,
    y?: number,
    options?: TextOptions
  ): void => {
    doc.font("ScriptNormal");
    doc.text(text, x, y, options);
  };
  doc.text2 = (
    text: string,
    x: number,
    y: number,
    options?: TextOptions
  ): void => {
    options = options || {};
    const color = options.color || doc.formatState?.overrideColor || "#000000";

    doc.fill(color);

    if (options.highlight) {
      doc.highlight(
        x * 72,
        y * 72 + doc.currentLineHeight() / 2,
        doc.widthOfString(text),
        doc.currentLineHeight(),
        { color: options.highlightColor }
      );
    }

    if (print.note.italic) {
      text = text.replace(/\[\[/g, "*[[").replace(/\]\]/g, "]]*");
    }
    const links: { start: number; length: number; url: string }[] = [];
    if (options.links) {
      let match;
      //Clean up all the links, while keeping track of their offset in order to add them back in later.
      while ((match = sparkRegexes.link.exec(text)) !== null) {
        match.index;
        const trimmed = match[3];
        links.push({
          start: match.index,
          length: trimmed?.length || 0,
          url: match[6] || "",
        });
        text =
          text.slice(0, match.index) +
          match[3] +
          text.slice(match.index + (match[0]?.length || 0));
      }
    }
    const splitForFormatting = [];
    //Split the text from the start (or from the previous link) until the current one
    //"This is a link: google.com and this is after"
    // |--------------|----------| - - - - - - - |
    let prevLink = 0;
    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      if (link) {
        splitForFormatting.push(text.slice(prevLink, link.start));
        splitForFormatting.push(
          text.slice(link.start, link.start + link.length)
        );
        prevLink = link.start + link.length;
      }
    }
    //...And then add whatever is left over
    //"This is a link: google.com and this is after"
    // | - - - - - - -| - - - - -|----------------|
    const leftover = text.slice(prevLink, text.length);
    if (leftover) {
      splitForFormatting.push(leftover);
    }

    //Further sub-split for bold, italic, underline, etc...
    for (let i = 0; i < splitForFormatting.length; i++) {
      const innerSplit = (splitForFormatting[i] || "")
        .split(/(\\\*)|(\*{1,3})|(\\?_)|(\[\[)|(\]\])/g)
        .filter((a) => {
          return a;
        });
      splitForFormatting.splice(i, 1, ...innerSplit);
      i += innerSplit.length - 1;
    }

    const textObjects = [];
    let currentIndex = 0;
    for (let i = 0; i < splitForFormatting.length; i++) {
      let elem = splitForFormatting[i];
      if (!elem) {
        break;
      }
      if (!doc.formatState) {
        doc.formatState = {};
      }
      if (elem === "***") {
        doc.formatState.italic = !doc.formatState.italic;
        doc.formatState.bold = !doc.formatState.bold;
      } else if (elem === "**") {
        doc.formatState.bold = !doc.formatState.bold;
      } else if (elem === "*") {
        doc.formatState.italic = !doc.formatState.italic;
      } else if (elem === "_") {
        doc.formatState.underline = !doc.formatState.underline;
      } else if (elem === "[[") {
        doc.formatState.overrideColor = print?.note?.color || "#000000";
      } else if (elem === "]]") {
        doc.formatState.overrideColor = undefined;
      } else {
        let font = "ScriptNormal";
        if (doc.formatState.bold && doc.formatState.italic) {
          font = "ScriptBoldOblique";
        } else if (doc.formatState.bold || options.bold) {
          font = "ScriptBold";
        } else if (doc.formatState.italic) {
          font = "ScriptOblique";
        }
        if (elem === "\\_" || elem === "\\*") {
          elem = elem.substr(1, 1);
        }
        let linkUrl = undefined;
        for (const link of links) {
          if (
            link.start <= currentIndex &&
            currentIndex < link.start + link.length
          ) {
            linkUrl = link.url;
          }
        }
        textObjects.push({
          text: elem,
          link: linkUrl,
          font: font,
          underline: linkUrl || doc.formatState.underline,
          color: doc.formatState.overrideColor || "#000000",
        });
      }
      currentIndex += elem.length;
    }
    const width =
      options.width !== undefined ? options.width : print.page_width;
    addTextbox(textObjects, doc, x * 72, y * 72, width * 72, {
      lineBreak: options.lineBreak,
      align: options.align,
      baseline: "top",
    });
  };
  doc.formatText = (
    text: string,
    x: number,
    y: number,
    options?: PDFKit.Mixins.TextOptions
  ): void => {
    const cacheCurrentState = doc.formatState;
    doc.resetFormat?.();
    doc.text2?.(text, x, y, options);
    doc.formatState = cacheCurrentState;
  };

  const splitBy = (text: string, delimiter: string): string[] => {
    const delimiterPATTERN = "(" + delimiter + ")",
      delimiterRE = new RegExp(delimiterPATTERN, "g");

    return text.split(delimiterRE).reduce((chunks: string[], item: string) => {
      if (item.match(delimiterRE)) {
        chunks.push(item);
      } else {
        chunks[chunks.length - 1] += item;
      }
      return chunks;
    }, []);
  };

  doc.text2WithImages = (
    text: string,
    x: number,
    y: number,
    options?: TextOptions
  ): void => {
    const textParts = splitBy(text, sparkRegexes.link.source);
    const parts: {
      text?: string;
      image?: {
        path: string;
      };
    }[] = [];
    for (let i = 0; i < textParts.length; i++) {
      const part = textParts[i];
      if (part) {
        const match = sparkRegexes.link.exec(part);
        if (match && match.length > 0) {
          parts.push({ image: { path: match[6] || "" } });
          parts.push({ text: part.slice((match[0] || "").length) });
        } else {
          parts.push({ text: textParts[i] });
        }
      }
    }
    const additionalY = 0;
    for (const part of parts) {
      if (part.text) {
        doc.text2?.(part.text, x, y + additionalY, options);
      }
    }
  };

  return doc;
};

const clearFormatting = (text: string): string => {
  let clean = text.replace(/\*/g, "");
  clean = clean.replace(/_/g, "");
  return clean;
};

const inline = (text: string): string => {
  return text.replace(/\n/g, " ");
};

const finishDoc = (doc: PdfDocument, filepath: string): void => {
  doc.pipe(new PdfWriteStream(filepath));
  doc.end();
};

const getTitleToken = (
  parsed: SparkParseResult,
  type: string
): SparkToken | null => {
  let result = null;
  if (parsed && parsed.titleTokens) {
    for (const section of Object.keys(parsed.titleTokens)) {
      parsed.titleTokens[section]?.forEach((token: SparkToken) => {
        if (token.type === type) {
          result = token;
        }
      });
    }
  }
  return result;
};

const generate = async (
  doc: PdfDocument,
  opts: PdfOptions,
  lineStructs?: Record<number, LineStruct>
): Promise<void> => {
  const parsed = opts.parsed;
  const lines = opts.lines;
  const print = opts.print;
  const screenplayCfg = opts.screenplayConfig;

  const titleToken = getTitleToken(parsed, "title");
  let authorToken = getTitleToken(parsed, "author");
  if (!authorToken) {
    authorToken = getTitleToken(parsed, "authors");
  }

  doc.info.Title = titleToken ? clearFormatting(inline(titleToken.text)) : "";
  doc.info.Author = authorToken
    ? clearFormatting(inline(authorToken.text))
    : "";
  doc.info.Creator = "sparkdown";

  // helper
  const center = (txt: string, y: number): void => {
    const textLength = txt.replace(/\*/g, "").replace(/_/g, "").length;
    const feed = (print.page_width - textLength * print.font_width) / 2;
    doc.text2?.(txt, feed, y);
  };

  if (screenplayCfg?.screenplay_print_title_page && parsed.titleTokens) {
    const innerWidth =
      print.page_width - print.right_margin - print.right_margin;
    const innerHeight = print.page_height - print.top_margin;
    const innerWidthThird = innerWidth / 3;
    const innerWidthHalf = innerWidth / 2;
    const joinChar = "\n\n";
    //top left
    const tlText =
      parsed.titleTokens?.["tl"]
        ?.sort(sortByOrder)
        ?.map((x: SparkToken) => x.text)
        ?.join(joinChar) || "";
    const tlTextHeight = doc.heightOfString(tlText, {
      width: innerWidthThird * 72,
      align: "left",
    });

    doc.text2?.(tlText, print.right_margin, print.top_margin, {
      width: innerWidthThird,
      align: "left",
      links: true,
    });

    //top center
    const tcText =
      parsed.titleTokens?.["tc"]
        ?.sort(sortByOrder)
        ?.map((x: SparkToken) => x.text)
        ?.join(joinChar) || "";
    const tcTextHeight = doc.heightOfString(tcText, {
      width: innerWidthThird * 72,
      align: "center",
    });
    doc.text2?.(
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
      parsed.titleTokens?.["tr"]
        ?.sort(sortByOrder)
        ?.map((x: SparkToken) => x.text)
        ?.join(joinChar) || "";
    const trTextHeight = doc.heightOfString(trText, {
      width: innerWidthThird * 72,
      align: "right",
    });
    doc.text2?.(
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
      parsed.titleTokens?.["bl"]
        ?.sort(sortByOrder)
        ?.map((x: SparkToken) => x.text)
        ?.join(joinChar) || "";
    const blTextHeight = doc.heightOfString(blText, {
      width: innerWidthHalf * 72,
      align: "left",
    });
    doc.text2?.(blText, print.right_margin, innerHeight - blTextHeight / 72, {
      width: innerWidthHalf,
      align: "left",
      links: true,
    });

    //bottom right
    const brText =
      parsed.titleTokens?.["br"]
        ?.sort(sortByOrder)
        ?.map((x: SparkToken) => x.text)
        ?.join(joinChar) || "";
    const brTextHeight = doc.heightOfString(brText, {
      width: innerWidthHalf * 72,
      align: "right",
    });
    doc.text2?.(
      brText,
      print.right_margin + innerWidthHalf,
      innerHeight - brTextHeight / 72,
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
      parsed.titleTokens?.["cc"]
        ?.sort(sortByOrder)
        ?.map((x: SparkToken) => x.text)
        ?.join(joinChar) || "";
    const ccTextHeight = doc.heightOfString(ccText, {
      width: innerWidth * 72,
      align: "center",
    });
    const centerStart =
      (innerHeight * 72 - topHeight - bottomHeight) / 2 - ccTextHeight / 2;
    doc.text2?.(ccText, print.right_margin, centerStart / 72, {
      width: innerWidth,
      align: "center",
      links: true,
    });

    // script
    doc.addPage();
  }

  if (opts.hooks && opts.hooks.beforeScript) {
    opts.hooks.beforeScript(doc);
  }

  let y = 0;
  let page = 1;
  let sceneNumber: string;
  let prevSceneContinuationHeader = "";
  let currentSectionLevel = 0;
  let currentSectionNumber: string;
  let currentSectionToken: LineItem;
  const sectionNumber = versionGenerator();
  let text;
  let afterSection = false; // helpful to determine synopsis indentation

  const printHeaderAndFooter = (continuation_header?: string): void => {
    if (screenplayCfg?.screenplay_print_header) {
      continuation_header = continuation_header || "";
      let offset = blankText(continuation_header);
      if (
        getIndentation(screenplayCfg?.screenplay_print_header).length >=
        continuation_header.length
      ) {
        offset = "";
      }
      if (offset) {
        offset += " ";
      }

      doc.formatText?.(
        offset + screenplayCfg?.screenplay_print_header,
        1.5,
        print.page_number_top_margin - 0.1,
        {
          color: "#777777",
        }
      );
    }
    if (screenplayCfg?.screenplay_print_footer) {
      doc.formatText?.(
        screenplayCfg?.screenplay_print_footer,
        1.5,
        print.page_height - 0.5,
        {
          color: "#777777",
        }
      );
    }
  };

  const printWatermark = (): void => {
    if (screenplayCfg?.screenplay_print_watermark) {
      const options = {
        origin: [0, 0],
      };
      const angle =
        (Math.atan(print.page_height / print.page_width) * 180) / Math.PI;
      // underline and rotate pdfkit bug (?) workaround
      const watermark = screenplayCfg?.screenplay_print_watermark.replace(
        /_/g,
        ""
      );
      // un-format
      const len = watermark.replace(/\*/g, "").length;
      let diagonal;
      diagonal = Math.sqrt(
        Math.pow(print.page_width, 2) + Math.pow(print.page_height, 2)
      );
      diagonal -= 4;
      const font_size = ((1.667 * diagonal) / len) * 72;
      doc.fontSize(font_size);
      doc.rotate(angle, options);
      doc.formatText?.(watermark, 2, -(font_size / 2) / 72, {
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

      if (screenplayCfg?.screenplay_print_page_numbers) {
        const pageNum = page.toFixed() + ".";
        const numberX =
          print.action.feed +
          print.action.max * print.font_width -
          pageNum.length * print.font_width;
        doc.simpleText?.(pageNum, numberX * 72, numberY * 72);
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
        color: print?.[line.type as PrintableTokenType]?.color || "#000000",
        highlight: false,
        bold: false,
        highlightColor: "#000000",
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
          opts.sceneInvisibleSections?.[line.scene || -1];
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
          if (screenplayCfg?.screenplay_print_section_numbers) {
            if (sectionToken !== currentSectionToken) {
              currentSectionNumber = sectionNumber(sectionToken.level || 0);
              currentSectionToken = sectionToken;
              sectionText = currentSectionNumber + ". " + sectionText;
            } else {
              sectionText =
                Array(currentSectionNumber.length + 3).join(" ") + sectionText;
            }
          }
          if (screenplayCfg?.screenplay_print_bookmarks) {
            if (
              hasInvisibleSection &&
              !screenplayCfg?.screenplay_print_bookmarks_for_invisible_sections
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
          if (screenplayCfg?.screenplay_print_bookmarks) {
            if (outline) {
              getOutlineChild(outline, outlineDepth, 0).addItem(text);
            }
          }
          currentScene = text;
          if (screenplayCfg?.screenplay_print_scene_headers_bold) {
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
              doc.text2?.(
                rightLine.text,
                feedRight,
                print.top_margin + print.font_height * yRight++,
                right_text_properties
              );
            });
          }
          feed -= (feed - print.left_margin) / 2;
        }

        doc.text2?.(
          text,
          feed,
          print.top_margin + print.font_height * y,
          textProperties
        );

        if (line.scene) {
          sceneNumber = String(line.scene);
          const sceneTextLength = sceneNumber.length;
          if (screenplayCfg?.screenplay_print_scene_headers_bold) {
            sceneNumber = "**" + sceneNumber + "**";
          }

          let shiftSceneNumber;

          if (
            screenplayCfg?.screenplay_print_scene_numbers === "both" ||
            screenplayCfg?.screenplay_print_scene_numbers === "left"
          ) {
            shiftSceneNumber = (sceneTextLength + 4) * print.font_width;
            doc.text2?.(
              sceneNumber,
              feed - shiftSceneNumber,
              print.top_margin + print.font_height * y,
              textProperties
            );
          }

          if (
            screenplayCfg?.screenplay_print_scene_numbers === "both" ||
            screenplayCfg?.screenplay_print_scene_numbers === "right"
          ) {
            shiftSceneNumber = (print.scene.max + 1) * print.font_width;
            doc.text2?.(
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

export const generatePdf = async (
  opts: PdfOptions,
  progress?: vscode.Progress<{ message?: string; increment?: number }>
): Promise<void> => {
  if (progress) {
    progress.report({ message: "Processing document", increment: 25 });
  }
  const doc = await initDoc(opts);
  generate(doc, opts);
  if (progress) {
    progress.report({ message: "Writing to disk", increment: 25 });
  }
  finishDoc(doc, opts.filepath);
};

export const generatePdfStats = async (opts: PdfOptions): Promise<PdfStats> => {
  const doc = await initDoc(opts);
  const stats: PdfStats = {
    pageCount: 1,
    pageCountReal: 1,
    lineMap: {},
  };
  stats.pageCount = opts.lines.length / opts.print.lines_per_page;
  doc.on("pageAdded", () => {
    stats.pageCountReal++;
  });

  await generate(doc, opts, stats.lineMap);
  console.log(stats.lineMap);
  return stats;
};
