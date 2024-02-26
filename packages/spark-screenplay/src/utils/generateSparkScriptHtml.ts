import { SparkToken } from "../../../sparkdown/src";
import { HTML_REPLACEMENTS } from "../constants/HTML_REPLACEMENTS";
import { SparkScreenplayConfig } from "../types/SparkScreenplayConfig";
import { sparkLexer } from "./sparkLexer";

export const generateSparkScriptHtml = (
  tokens: SparkToken[],
  config: SparkScreenplayConfig
): string[] => {
  const html: string[] = [];
  let currentIndex = 0;
  let isAction = false;

  const append = (str: string) => {
    html[html.length - 1] += str;
  };

  const push = (str: string) => {
    if (html[html.length - 1] === "") {
      append(str);
    } else {
      html.push(str);
    }
  };

  while (currentIndex < tokens.length) {
    const currentToken = tokens[currentIndex];
    if (!currentToken) {
      currentIndex++;
      continue;
    }
    const text = currentToken.text?.trimEnd();
    const line = currentToken.line;
    if (text) {
      currentToken.html = sparkLexer(text, currentToken.tag, HTML_REPLACEMENTS);
    } else {
      currentToken.html = "";
    }
    if (currentToken.tag == "action" || currentToken.tag == "centered") {
      let classes = "haseditorline";

      let elStart = "\n";
      if (!isAction) {
        elStart = "<p>"; //first action element
      }
      if (currentToken.tag == "centered") {
        if (isAction) {
          elStart = ""; //It's centered anyway, no need to add anything
        }
        classes += " centered";
      }
      append(
        `${elStart}<span class="${classes}" id="sourceline_${line}">${currentToken.html}</span>`
      );

      isAction = true;
    } else if (currentToken.tag == "separator" && isAction) {
      if (currentIndex + 1 < tokens.length - 1) {
        //we're not at the end
        const next_type = tokens[currentIndex + 1]?.tag;
        if (
          next_type == "action" ||
          next_type == "separator" ||
          next_type == "centered"
        ) {
          append("\n");
        }
      } else if (isAction) {
        //we're at the end
        append("</p>");
      }
    } else {
      if (isAction) {
        //no longer, close the paragraph
        isAction = false;
        append("</p>");
      }
      if (currentToken.tag === "dialogue_box") {
        if (currentToken.position === "left") {
          push('<div class="dual-dialogue">');
        }
        push(
          '<div class="dialogue' +
            (currentToken.position ? " " + currentToken.position : "") +
            '">'
        );
      }
      switch (currentToken.tag) {
        case "scene":
          let content = currentToken.html;
          if (config.screenplay_print_scene_headers_bold) {
            content =
              '<span class="bold haseditorline" id="sourceline_' +
              line +
              '">' +
              content +
              "</span>";
          }

          push(
            '<h3 class="haseditorline" data-scenenumber="' +
              currentToken.scene +
              '" data-position="' +
              line +
              '" ' +
              (currentToken.scene ? ' id="sourceline_' + line + '">' : ">") +
              content +
              "</h3>"
          );
          push("");
          break;
        case "transition":
          push(
            '<h2 class="haseditorline" id="sourceline_' +
              line +
              '">' +
              text +
              "</h2>"
          );
          push("");
          break;

        case "dialogue_character_name":
          if (currentToken.position == "left") {
            append('<div class="dialogue left">');
          } else if (currentToken.position == "right") {
            append('</div><div class="dialogue right">');
          }

          append(
            '<h4 class="haseditorline" id="sourceline_' +
              line +
              '">' +
              text +
              "</h4>"
          );

          break;
        case "dialogue_line_parenthetical":
          append(
            '<p class="haseditorline dialogue_parenthetical" id="sourceline_' +
              line +
              '" >' +
              currentToken.html +
              "</p>"
          );
          break;
        case "dialogue":
          if (text == "  ") {
            append("<br>");
          } else
            append(
              '<p class="haseditorline" id="sourceline_' +
                line +
                '">' +
                currentToken.html +
                "</p>"
            );
          break;

        case "section":
          if (config.screenplay_print_sections) {
            push(
              '<p class="haseditorline section" id="sourceline_' +
                line +
                '" data-position="' +
                line +
                '" data-depth="' +
                currentToken.level +
                '">' +
                text +
                "</p>"
            );
            push("");
          }
          break;
        case "label":
          if (config.screenplay_print_chunks) {
            push(
              '<p class="haseditorline label" id="sourceline_' +
                line +
                '" >' +
                currentToken.html +
                "</p>"
            );
            push("");
          }
          break;

        case "note":
          if (config.screenplay_print_notes) {
            append(
              '<p class="haseditorline note" id="sourceline_' +
                line +
                '">' +
                currentToken.html +
                "</p>"
            );
          }
          break;

        case "page_break":
          push("<hr />");
          push("");
          break;
      }

      if (
        currentToken.tag === "dialogue_box" &&
        currentToken.position === "right"
      ) {
      }

      if (currentToken.tag === "dialogue_box") {
        append("</div>");
        if (currentToken.position === "right") {
          append("</div>");
        }
        push("");
      }
    }

    currentIndex++;
  }
  return html;
};
