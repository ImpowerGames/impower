import { encode } from "html-entities";
import { getScriptAugmentations, SparkParser } from "../../../../spark-engine";
import {
  decodeBase64,
  generateSparkPdfData,
  pdfGenerate,
  PdfWriteStream,
} from "../../../../spark-screenplay";
import bolditalic from "../../../public/fonts/courier-prime-bold-italic.ttf";
import bold from "../../../public/fonts/courier-prime-bold.ttf";
import italic from "../../../public/fonts/courier-prime-italic.ttf";
import normal from "../../../public/fonts/courier-prime.ttf";
import { SPARK_SCREENPLAY_CONFIG } from "../constants/SPARK_SCREENPLAY_CONFIG";
import { createPdfDocument } from "./createPdfDocument";
import { downloadFile } from "./downloadFile";

export const exportPdf = async (
  name: string,
  script: string,
  files?: Record<
    string,
    {
      name?: string;
      fileType?: string;
      fileUrl?: string;
    }
  >
): Promise<void> => {
  const augmentations = getScriptAugmentations(files);
  const result = SparkParser.instance.parse(script, {
    augmentations,
    removeBlockComments: true,
    skipTokens: ["condition"],
  });
  const pdfData = generateSparkPdfData(result, SPARK_SCREENPLAY_CONFIG, {
    normal: decodeBase64(normal),
    bold: decodeBase64(bold),
    italic: decodeBase64(italic),
    bolditalic: decodeBase64(bolditalic),
  });
  const doc = createPdfDocument(pdfData);
  pdfGenerate(doc, pdfData, encode);
  const pdf = await new Promise<Uint8Array>((resolve) => {
    doc.pipe(
      new PdfWriteStream(async (chunks) => {
        resolve(Buffer.concat(chunks));
      })
    );
    doc.end();
  });
  downloadFile(`${name}.pdf`, "application/pdf", pdf);
};
