import { encode } from "html-entities";
import { LineStruct, PdfData, pdfGenerate } from "../../../spark-screenplay";
import { createPdfDocument } from "./createPdfDocument";

export const generatePdfStats = (
  pdfData: PdfData
): {
  pageCount: number;
  pageCountReal: number;
  lineMap: Record<number, LineStruct>;
} => {
  const doc = createPdfDocument(pdfData);
  const stats = {
    pageCount: 1,
    pageCountReal: 1,
    lineMap: {},
  };
  stats.pageCount = pdfData.lines.length / pdfData.print.lines_per_page;
  doc.on("pageAdded", () => {
    stats.pageCountReal++;
  });
  pdfGenerate(doc, pdfData, encode, stats.lineMap);
  console.log(stats.lineMap);
  return stats;
};
