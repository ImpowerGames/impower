import { encode } from "html-entities";
import { PdfWriteStream } from "../../../../../packages/spark-screenplay/src/classes/PdfWriteStream";
import type { SparkScreenplayConfig } from "../../../../../packages/spark-screenplay/src/types/SparkScreenplayConfig";
import { generateSparkPdfData } from "../../../../../packages/spark-screenplay/src/utils/generateSparkPdfData";
import { pdfGenerate } from "../../../../../packages/spark-screenplay/src/utils/pdfGenerate";
import type { SparkProgram } from "../../../../../packages/sparkdown/src/types/SparkProgram";
import combineFrontMatter from "../../../../../packages/sparkdown/src/utils/combineFrontMatter";
import combineTokens from "../../../../../packages/sparkdown/src/utils/combineTokens";
import bolditalic from "../../../public/fonts/courier-prime-bold-italic.ttf";
import bold from "../../../public/fonts/courier-prime-bold.ttf";
import italic from "../../../public/fonts/courier-prime-italic.ttf";
import normal from "../../../public/fonts/courier-prime.ttf";
import { createPdfDocument } from "./createPdfDocument";
import { downloadFile } from "./downloadFile";

export const exportPdf = async (
  name: string,
  programs: SparkProgram[],
  config: SparkScreenplayConfig = {
    screenplay_print_title_page: true,
    screenplay_print_bookmarks_for_invisible_sections: true,
    screenplay_print_dialogue_split_across_pages: true,
    screenplay_print_page_numbers: true,
    screenplay_print_scene_headers_bold: true,
    screenplay_print_scene_numbers: "left",
  }
) => {
  const frontMatter = combineFrontMatter(programs);
  const tokens = combineTokens(programs);
  const pdfData = generateSparkPdfData(frontMatter, tokens, config, {
    normal,
    bold,
    italic,
    bolditalic,
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
