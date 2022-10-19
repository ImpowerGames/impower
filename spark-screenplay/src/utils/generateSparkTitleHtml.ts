import { SparkParseResult } from "../../../sparkdown";
import { htmlReplacements } from "../constants/htmlReplacements";
import { SparkScreenplayConfig } from "../types/SparkScreenplayConfig";
import { sparkLexer } from "./sparkLexer";

export const generateSparkTitleHtml = (
  result: SparkParseResult,
  config: SparkScreenplayConfig
): string => {
  if (!config.screenplay_print_title_page) {
    return "";
  }

  if (!result.titleTokens) {
    return "";
  }

  const populatedTokenKeys = Object.keys(result.titleTokens);
  if (populatedTokenKeys.length === 0) {
    return "";
  }

  const titleTokenKeys = Array.from(
    new Set([
      "tl",
      "tc",
      "tr",
      "cc",
      "bl",
      "br",
      "hidden",
      ...populatedTokenKeys,
    ])
  );

  const html: string[] = [];
  let header = undefined;
  let footer = undefined;

  for (const section of titleTokenKeys) {
    const tokens = result.titleTokens[section] || [];
    tokens.sort((a, b) => {
      if (a.order === -1) {
        return 0;
      } else {
        return a.order - b.order;
      }
    });
    html.push(`<div class="titlepagesection" data-position="${section}">`);
    let currentIndex = 0; /*, previous_type = null*/
    while (currentIndex < tokens.length) {
      const currentToken = tokens[currentIndex];
      if (!currentToken) {
        currentIndex++;
        continue;
      }
      if (currentToken.ignore) {
        currentIndex++;
        continue;
      }
      const text = currentToken.text;
      const line = currentToken.line;
      if (text) {
        currentToken.html = sparkLexer(text, undefined, htmlReplacements, true);
      }
      switch (currentToken.type) {
        case "title":
          html.push(
            `<h1 class="haseditorline titlepagetoken" id="sourceline_${line}">${currentToken.html}</h1>`
          );
          break;
        case "header":
          header = currentToken;
          break;
        case "footer":
          footer = currentToken;
          break;
        default:
          html.push(
            `<p class="${currentToken.type} haseditorline titlepagetoken" id="sourceline_${line}">${currentToken.html}</p>`
          );
          break;
      }
      currentIndex++;
    }
    html.push(`</div>`);
  }

  if (header) {
    html.push(
      `<div class="header" id="sourceline_${header.line}">${header.html}</div>`
    );
  } else if (config.screenplay_print_header) {
    html.push(
      `<div class="header">${sparkLexer(
        config.screenplay_print_header,
        undefined,
        htmlReplacements,
        true
      )}</div>`
    );
  }

  if (footer) {
    html.push(
      `<div class="footer" id="sourceline_${footer.line}">${footer.html}</div>`
    );
  } else if (config.screenplay_print_footer) {
    html.push(
      `<div class="footer">${sparkLexer(
        config.screenplay_print_footer,
        undefined,
        htmlReplacements,
        true
      )}</div>`
    );
  }

  return html.join("");
};
