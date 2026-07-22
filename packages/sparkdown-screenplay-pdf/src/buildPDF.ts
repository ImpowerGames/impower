import PDFKit from "pdfkit";
import ScreenplayParser from "@impower/sparkdown-screenplay/src/classes/ScreenplayParser";
import type { ScreenplayConfig } from "@impower/sparkdown-screenplay/src/types/ScreenplayConfig";
import { generateScreenplayPrintData } from "@impower/sparkdown-screenplay/src/utils/generateScreenplayPrintData";
import PdfWriteStream from "./classes/PdfWriteStream";
import ScreenplayPrinter from "./classes/ScreenplayPrinter";
import EmojiSvgProvider from "./emoji/EmojiSvgProvider";
import { setEmojiProvider } from "./emoji/emojiText";

export const buildPDF = async (
  scripts: string[],
  config?: ScreenplayConfig,
  fonts?: {
    normal: ArrayBuffer;
    bold: ArrayBuffer;
    italic: ArrayBuffer;
    bolditalic: ArrayBuffer;
    emoji?: ArrayBuffer;
  },
  onProgress?: (value: {
    kind: string;
    title: string;
    cancellable: boolean;
    message?: string;
    percentage?: number;
  }) => void,
) => {
  let currentProgress = 0;

  const progress = (kind: "begin" | "report" | "end", percentage: number) => {
    onProgress?.({
      kind,
      title: "Exporting PDF",
      cancellable: false,
      percentage,
    });
    currentProgress = percentage;
  };

  progress("begin", 0);

  const parser = new ScreenplayParser();
  const tokens = parser.parseAll(scripts);
  const printData = generateScreenplayPrintData(tokens, config, fonts);

  progress("report", 2);

  const size = printData?.profile.paper_size === "a4" ? "A4" : "LETTER";
  const fontSize = printData?.profile.font_size || 12;

  const doc = new PDFKit({
    size,
    font: "",
    compress: false,
    margins: { top: 0, left: 0, bottom: 0, right: 0 },
  }) as PDFKit.PDFDocument;
  if (doc.info) {
    doc.info.Title = printData.info.title;
    doc.info.Author = printData.info.author;
    doc.info.Creator = "sparkdown";
  }
  if (fonts) {
    for (const [fontName, fontBuffer] of Object.entries(fonts)) {
      // The color emoji font is never used as a pdfkit text font (its glyphs
      // are empty outlines); it is drawn as vector SVG via EmojiSvgProvider.
      if (fontName === "emoji" || !fontBuffer) {
        continue;
      }
      doc.registerFont(fontName, fontBuffer);
    }
    if (fonts.normal) {
      doc.font(fonts.normal);
    }
    if (fonts.emoji) {
      try {
        const provider = new EmojiSvgProvider(fonts.emoji);
        if (provider.hasSvg) {
          setEmojiProvider(doc, provider);
        }
      } catch (e) {
        // If the emoji font can't be parsed, emoji simply fall back to text.
        console.warn("Failed to initialize emoji SVG provider:", e);
      }
    }
  }
  doc.fontSize(fontSize);

  progress("report", 5);

  const progressBeforeGenerate = currentProgress;
  const printer = new ScreenplayPrinter(
    doc,
    printData,
    (percentage: number) => {
      progress(
        "report",
        progressBeforeGenerate +
          (100 - progressBeforeGenerate) * (percentage / 100),
      );
    },
  );
  printer.print();

  const array = await new Promise<Buffer>((resolve) => {
    doc.pipe(
      new PdfWriteStream(async (chunks) => {
        resolve(Buffer.concat(chunks));
      }),
    );
    doc.end();
  });

  const arrayBuffer = array.buffer.slice(
    array.byteOffset,
    array.byteLength + array.byteOffset,
  );

  progress("end", 100);

  return arrayBuffer;
};
