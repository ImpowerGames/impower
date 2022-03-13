/* eslint-disable no-template-curly-in-string */
import { snippet } from "@codemirror/autocomplete";
import { EditorView } from "@codemirror/basic-setup";

export const quickSnippetTemplates: { [id: string]: string } = {
  bold: "**{selection}**${}",
  italic: "*{selection}*${}",
  underline: "_{selection}_${}",
  center: "> {selection} <${}",
  dynamic: "{{selection}}${}",

  section: "\n# ${NewSection}${}\n",
  scene: "\n${INT.} ${LOCATION} - ${TIME}${}\n",
  dialogue: "\n${CHARACTER}${}\n",
  parenthetical: "(${})${}\n",
  transition: "\n${CUT}${} TO:\n",

  image: "[[${imageName}]]${}\n",
  audio: "((${audioName}))${}\n",
  spawn: "~ spawn(${entityName})${}\n",
  move: "~ move(${entityName}, ${x}, ${y})${}\n",
  destroy: "~ destroy(${entityName})${}\n",

  choice: "- [${option}] > ${SectionName}${}\n",
  condition: "- ${variableName} == ${value}:${}\n",
  conditional_choice:
    "- ${variableName} == ${value}: [${option}] > ${SectionName}${}\n",
  go: "> ${SectionName}${}\n",
  repeat: "^${}\n",
  return: "< ${}\n",

  declare_variable: "var ${newVariable} = ${value}${}\n",
  assign_variable: "~ ${variableName} = ${value}${}\n",
  declare_tag: "tag ${newTag} = `${value}${}`\n",
  declare_image: "image ${newImage} = `${value}${}`\n",
  declare_audio: "audio ${newAudio} = `${value}${}`\n",
  declare_video: "video ${newVideo} = `${value}${}`\n",
  declare_text: "text ${newText} = `${value}${}`\n",
};

export const quickSnippet = (view: EditorView, type: string): void => {
  const snippetTemplate = quickSnippetTemplates[type || ""];
  if (!view || !type || !snippetTemplate) {
    return;
  }
  const state = view?.state;
  const dispatch = view?.dispatch;
  const mainSelection = state.selection.main;
  const anchor = mainSelection?.anchor;
  const head = mainSelection?.head;
  const from = Math.min(anchor, head);
  const to = Math.max(anchor, head);
  const doc = state?.doc;
  const selectedText = doc.sliceString(from, to);
  const isInlineTemplate = !snippetTemplate.endsWith("\n");
  const fromLine = doc.lineAt(from);
  const nextLineFrom = fromLine.to + 1;
  const beforeLine = doc.lineAt(fromLine.from - 1);
  const afterLine = doc.lineAt(fromLine.to + 1);
  const isLineEmpty = !fromLine.text.trim();
  const isLineBeforeEmpty = !beforeLine.text.trim();
  const isLineAfterEmpty = !afterLine.text.trim();
  const snippetFrom = isInlineTemplate || isLineEmpty ? from : nextLineFrom;
  const snippetTo = isInlineTemplate || isLineEmpty ? to : nextLineFrom;
  // Insert selected text if necessary
  let formattedTemplate = snippetTemplate.replace("{selection}", selectedText);
  if (!isInlineTemplate) {
    if (!isLineEmpty && !isLineAfterEmpty) {
      // Needs to end with additional newline
      formattedTemplate += "\n";
    }
    if (isLineEmpty && isLineBeforeEmpty) {
      // Line before is already blank, so no need to start with newline
      formattedTemplate = formattedTemplate.replace(/^\n/, "");
    }
    if (isLineEmpty && isLineAfterEmpty) {
      // Line after is already blank, so no need to end with newline
      formattedTemplate = formattedTemplate.replace(/\n$/, "");
    }
  }
  const s = snippet(formattedTemplate);
  s({ state, dispatch }, undefined, snippetFrom, snippetTo);
};
