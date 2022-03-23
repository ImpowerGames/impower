/* eslint-disable no-continue */
import { htmlReplacements } from "../constants/htmlReplacements";
import { SparkParseResult } from "../types/SparkParseResult";
import { SparkToken } from "../types/SparkToken";
import { sparkLexer } from "./sparkLexer";

export const generateSparkHtml = (
  result: SparkParseResult
): {
  scriptHtml?: string;
  titleHtml?: string;
} => {
  const html = [];
  const titleHtml = [];
  // Generate html for title page
  if (result.titleTokens) {
    const sections = Object.keys(result.titleTokens);
    for (let i = 0; i < sections.length; i += 1) {
      const section = sections[i];
      if (!result.titleTokens) {
        result.titleTokens = {};
      }
      const titlePageTokens = result.titleTokens[section];
      if (titlePageTokens) {
        titlePageTokens.sort((a, b) => {
          if (a.order == null) {
            return 0;
          }
          return a.order - b.order;
        });
      }
      titleHtml.push(`<div class="title-page-section" data-line="${section}">`);
      let currentIndex = 0; /* , previous_type = null */
      while (titlePageTokens && currentIndex < titlePageTokens.length) {
        const currentToken: SparkToken = titlePageTokens[currentIndex];
        if (currentToken.ignore) {
          currentIndex += 1;
          continue;
        }
        if (currentToken.content !== "") {
          const html = sparkLexer(
            currentToken.content,
            undefined,
            htmlReplacements,
            true
          );
          if (html !== undefined) {
            currentToken.html = html;
          }
        }
        switch (currentToken.type) {
          case "title":
            titleHtml.push(
              `<h1 class="source title-page-token" id="line_${currentToken.line}">${currentToken.html}</h1>`
            );
            break;
          default:
            titleHtml.push(
              `<p class="${currentToken.type} source title-page-token" id="line_${currentToken.line}">${currentToken.html}</p>`
            );
            break;
        }
        currentIndex += 1;
      }
      titleHtml.push(`</div>`);
    }
  }

  // Generate html for script
  let currentIndex = 0;
  let isAction = false;
  while (currentIndex < result.scriptTokens.length) {
    const currentToken: SparkToken = result.scriptTokens[currentIndex];
    if (currentToken.content !== "") {
      const html = sparkLexer(
        currentToken.content,
        currentToken.type,
        htmlReplacements
      );
      if (html !== undefined) {
        currentToken.html = html;
      }
    } else {
      currentToken.html = "";
    }

    if (
      (currentToken.type === "action" || currentToken.type === "centered") &&
      !currentToken.ignore
    ) {
      let classes = "source";

      let elStart = "\n";
      if (!isAction) elStart = "<p>"; // first action element
      if (currentToken.type === "centered") {
        if (isAction) elStart = ""; // It's centered anyway, no need to add anything
        classes += " centered";
      }
      html.push(
        `${elStart}<span class="${classes}" id="line_${currentToken.line}">${currentToken.html}</span>`
      );

      isAction = true;
    } else if (currentToken.type === "separator" && isAction) {
      if (currentIndex + 1 < result.scriptTokens.length - 1) {
        // we're not at the end
        const next_type = result.scriptTokens[currentIndex + 1]?.type;
        if (
          next_type === "action" ||
          next_type === "separator" ||
          next_type === "centered"
        ) {
          html.push("\n");
        }
      } else if (isAction) {
        // we're at the end
        html.push("</p>");
      }
    } else {
      if (isAction) {
        // no longer, close the paragraph
        isAction = false;
        html.push("</p>");
      }
      switch (currentToken.type) {
        case "scene":
          html.push(
            `<h3 class="source" ${
              currentToken.scene ? `id="line_${currentToken.line}"` : ""
            } data-scene="${currentToken.scene}" data-line="${
              currentToken.line
            }">${currentToken.html}</h3>`
          );
          break;
        case "transition":
          html.push(
            `<h2 class="source" id="line_${currentToken.line}">${currentToken.content}</h2>`
          );
          break;

        case "dual_dialogue_begin":
          html.push('<div class="dual-dialogue">');
          break;

        case "dialogue_begin":
          html.push(
            `<div class="dialogue${
              currentToken.position ? ` ${currentToken.position}` : ""
            }">`
          );
          break;

        case "character":
          if (currentToken.position === "left") {
            html.push('<div class="dialogue left">');
          } else if (currentToken.position === "right") {
            html.push('</div><div class="dialogue right">');
          }

          html.push(
            `<h4 class="source" id="line_${currentToken.line}">${currentToken.content}</h4>`
          );

          break;
        case "parenthetical":
          html.push(
            `<p class="source parenthetical" id="line_${currentToken.line}" >${currentToken.html}</p>`
          );
          break;
        case "dialogue":
          if (currentToken.content === "  ") html.push("<br>");
          else
            html.push(
              `<p class="source" id="line_${currentToken.line}">${currentToken.html}</p>`
            );
          break;
        case "dialogue_end":
          html.push("</div> ");
          break;
        case "dual_dialogue_end":
          html.push("</div></div> ");
          break;

        case "section":
          html.push(
            `<p class="source section" id="line_${currentToken.line}" data-line="${currentToken.line}">${currentToken.content}</p>`
          );
          break;
        case "synopses":
          html.push(
            `<p class="source synopses" id="line_${currentToken.line}" >${currentToken.html}</p>`
          );
          break;
        case "lyric":
          html.push(
            `<p class="source lyric" id="line_${currentToken.line}">${currentToken.html}</p>`
          );
          break;

        case "note":
          html.push(
            `<p class="source note" id="line_${currentToken.line}">${currentToken.html}</p>`
          );
          break;
        case "boneyard_begin":
          html.push("<!-- ");
          break;
        case "boneyard_end":
          html.push(" -->");
          break;

        case "page_break":
          html.push("<hr />");
          break;
        /* case 'separator':
                         html.push('<br />');
                         break; */
        default:
          break;
      }
    }
    currentIndex += 1;
  }
  const htmlResult: { scriptHtml?: string; titleHtml?: string } = {};
  if (html && html.length > 0) {
    const scriptHtmlString = html.join("");
    if (scriptHtmlString) {
      htmlResult.scriptHtml = scriptHtmlString;
    }
  }
  if (titleHtml && titleHtml.length > 0) {
    const titleHtmlString = titleHtml.join("");
    if (titleHtmlString) {
      htmlResult.titleHtml = titleHtmlString;
    }
  }
  return htmlResult;
};
