import { SparkProgram } from "../../../sparkdown/src";
import { HTML_REPLACEMENTS } from "../constants/HTML_REPLACEMENTS";
import { SparkScreenplayConfig } from "../types/SparkScreenplayConfig";
import { sparkLexer } from "./sparkLexer";

export const generateSparkScriptHtml = (
  program: SparkProgram,
  config: SparkScreenplayConfig
): string => {
  const html: string[] = [];
  let currentIndex = 0;
  let isAction = false;

  while (currentIndex < program.tokens.length) {
    const currentToken = program.tokens[currentIndex];
    if (!currentToken) {
      currentIndex++;
      continue;
    }
    const text = currentToken.text?.trimEnd();
    const line = currentToken.line;
    if (text) {
      currentToken.html = sparkLexer(
        text,
        currentToken.type,
        HTML_REPLACEMENTS
      );
    } else {
      currentToken.html = "";
    }
    if (currentToken.type == "action" || currentToken.type == "centered") {
      let classes = "haseditorline";

      let elStart = "\n";
      if (!isAction) {
        elStart = "<p>"; //first action element
      }
      if (currentToken.type == "centered") {
        if (isAction) {
          elStart = ""; //It's centered anyway, no need to add anything
        }
        classes += " centered";
      }
      html.push(
        `${elStart}<span class="${classes}" id="sourceline_${line}">${currentToken.html}</span>`
      );

      isAction = true;
    } else if (currentToken.type == "separator" && isAction) {
      if (currentIndex + 1 < program.tokens.length - 1) {
        //we're not at the end
        const next_type = program.tokens[currentIndex + 1]?.type;
        if (
          next_type == "action" ||
          next_type == "separator" ||
          next_type == "centered"
        ) {
          html.push("\n");
        }
      } else if (isAction) {
        //we're at the end
        html.push("</p>");
      }
    } else {
      if (isAction) {
        //no longer, close the paragraph
        isAction = false;
        html.push("</p>");
      }
      switch (currentToken.type) {
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

          html.push(
            '<h3 class="haseditorline" data-scenenumber="' +
              currentToken.scene +
              '" data-position="' +
              line +
              '" ' +
              (currentToken.scene ? ' id="sourceline_' + line + '">' : ">") +
              content +
              "</h3>"
          );
          break;
        case "transition":
          html.push(
            '<h2 class="haseditorline" id="sourceline_' +
              line +
              '">' +
              text +
              "</h2>"
          );
          break;

        case "dual_dialogue_start":
          html.push('<div class="dual-dialogue">');
          break;

        case "dialogue_start":
          html.push(
            '<div class="dialogue' +
              (currentToken.position ? " " + currentToken.position : "") +
              '">'
          );
          break;

        case "dialogue_character":
          if (currentToken.position == "left") {
            html.push('<div class="dialogue left">');
          } else if (currentToken.position == "right") {
            html.push('</div><div class="dialogue right">');
          }

          html.push(
            '<h4 class="haseditorline" id="sourceline_' +
              line +
              '">' +
              text +
              "</h4>"
          );

          break;
        case "dialogue_parenthetical":
          html.push(
            '<p class="haseditorline dialogue_parenthetical" id="sourceline_' +
              line +
              '" >' +
              currentToken.html +
              "</p>"
          );
          break;
        case "dialogue":
          if (text == "  ") html.push("<br>");
          else
            html.push(
              '<p class="haseditorline" id="sourceline_' +
                line +
                '">' +
                currentToken.html +
                "</p>"
            );
          break;
        case "dialogue_end":
          html.push("</div> ");
          break;
        case "dual_dialogue_end":
          html.push("</div></div> ");
          break;

        case "section":
          if (config.screenplay_print_sections) {
            html.push(
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
          }
          break;
        case "synopsis":
          if (config.screenplay_print_synopses) {
            html.push(
              '<p class="haseditorline synopsis" id="sourceline_' +
                line +
                '" >' +
                currentToken.html +
                "</p>"
            );
          }
          break;
        case "lyric":
          html.push(
            '<p class="haseditorline lyric" id="sourceline_' +
              line +
              '">' +
              currentToken.html +
              "</p>"
          );
          break;

        case "note":
          if (config.screenplay_print_notes) {
            html.push(
              '<p class="haseditorline note" id="sourceline_' +
                line +
                '">' +
                currentToken.html +
                "</p>"
            );
          }
          break;

        case "page_break":
          html.push("<hr />");
          break;
      }
    }

    currentIndex++;
  }
  return html.join("");
};
