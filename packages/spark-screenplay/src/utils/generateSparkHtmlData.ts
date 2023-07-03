import { SparkProgram } from "../../../sparkdown/src";
import { STATIC_HTML } from "../constants/STATIC_HTML";
import { SparkScreenplayConfig } from "../types/SparkScreenplayConfig";
import { encodeBase64 } from "./encodeBase64";
import { generateSparkScriptHtml } from "./generateSparkScriptHtml";
import { generateSparkTitleHtml } from "./generateSparkTitleHtml";

export const generateSparkHtmlData = (
  program: SparkProgram,
  config: SparkScreenplayConfig,
  fonts: {
    normal?: ArrayBuffer | Uint8Array;
    bold?: ArrayBuffer | Uint8Array;
    italic?: ArrayBuffer | Uint8Array;
    bolditalic?: ArrayBuffer | Uint8Array;
  }
): string => {
  let rawHtml: string = STATIC_HTML;

  let pageClasses = "innerpage";
  if (config.screenplay_print_scene_numbers === "left") {
    pageClasses = "innerpage numberonleft";
  } else if (config.screenplay_print_scene_numbers === "right") {
    pageClasses = "innerpage numberonright";
  } else if (config.screenplay_print_scene_numbers === "both") {
    pageClasses = "innerpage numberonleft numberonright";
  }
  rawHtml = rawHtml.replace("$SCRIPTCLASS$", pageClasses);

  if (fonts.normal) {
    rawHtml = rawHtml.replace("$COURIERPRIME$", encodeBase64(fonts.normal));
  }
  if (fonts.bold) {
    rawHtml = rawHtml.replace("$COURIERPRIME-BOLD$", encodeBase64(fonts.bold));
  }
  if (fonts.italic) {
    rawHtml = rawHtml.replace(
      "$COURIERPRIME-ITALIC$",
      encodeBase64(fonts.italic)
    );
  }
  if (fonts.bolditalic) {
    rawHtml = rawHtml.replace(
      "$COURIERPRIME-BOLD-ITALIC$",
      encodeBase64(fonts.bolditalic)
    );
  }

  const titleHtml = generateSparkTitleHtml(program, config);
  if (titleHtml) {
    rawHtml = rawHtml.replace("$TITLEPAGE$", titleHtml);
  } else {
    rawHtml = rawHtml.replace("$TITLEDISPLAY$", "hidden");
  }

  const scriptHtml = generateSparkScriptHtml(program, config);
  rawHtml = rawHtml.replace("$SCREENPLAY$", scriptHtml.join(""));

  return rawHtml;
};
