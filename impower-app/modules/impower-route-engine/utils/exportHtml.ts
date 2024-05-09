import {
  EngineSparkParser,
  getScriptAugmentations,
} from "../../../../spark-engine";
import {
  decodeBase64,
  generateSparkHtmlData,
} from "../../../../sparkdown-screenplay";
import bolditalic from "../../../public/fonts/courier-prime-bold-italic.ttf";
import bold from "../../../public/fonts/courier-prime-bold.ttf";
import italic from "../../../public/fonts/courier-prime-italic.ttf";
import normal from "../../../public/fonts/courier-prime.ttf";
import { SPARK_SCREENPLAY_CONFIG } from "../constants/SPARK_SCREENPLAY_CONFIG";
import { downloadFile } from "./downloadFile";

export const exportHtml = async (
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
  const result = EngineSparkParser.instance.parse(script, {
    augmentations,
    removeBlockComments: true,
  });
  const html = generateSparkHtmlData(result, SPARK_SCREENPLAY_CONFIG, {
    normal: decodeBase64(normal),
    bold: decodeBase64(bold),
    italic: decodeBase64(italic),
    bolditalic: decodeBase64(bolditalic),
  });
  downloadFile(`${name}.html`, "text/html", html);
};
