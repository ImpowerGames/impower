import {
  LineStruct,
  PdfData,
  pdfGenerate,
} from "@impower/spark-screenplay/src/index";
import { encode } from "html-entities";
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
