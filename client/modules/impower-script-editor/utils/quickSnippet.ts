/* eslint-disable no-template-curly-in-string */
import { snippet } from "@codemirror/autocomplete";
import { EditorView } from "@codemirror/basic-setup";

export const quickSnippetTemplates: { [id: string]: string } = {
  bold: "**{selection}**${}",
  italic: "*{selection}*${}",
  underline: "_{selection}_${}",
  center: "> {selection} <${}",
  dynamic: "{{selection}}${}",

  section: "\n# ${SectionName}\n${}",
  scene: "\n${INT}. ${LOCATION} - ${TIME}\n${}",
  dialogue: "\n${CHARACTER}\n${dialogue}\n${}",
  parenthetical: "(${tone})\n${}",
  transition: "\n${CUT} TO:\n${}",

  image: "[[${imageName}]]\n${}",
  audio: "((${audioName}))\n${}",
  spawn: "* spawn(${entityName})\n${}",
  move: "* move(${entityName}, ${x}, ${y})\n${}",
  destroy: "* destroy(${entityName})\n${}",

  choice: "+ ${choice} > ${SectionName}\n${}",
  condition: "* if (${variableName} == ${value}):\n${}",
  go: "> ${SectionName}\n${}",
  repeat: "^${}\n${}",
  return: "< ${}\n${}",

  declare_variable: "var ${variableName} = ${value}\n${}",
  assign_variable: "* ${variableName} = ${value}\n${}",
  declare_tag: "tag ${tagName} = `${value}`\n${}",
  declare_image: "image ${imageName} = `${value}`\n${}",
  declare_audio: "audio ${audioName} = `${value}`\n${}",
  declare_video: "video ${videoName} = `${value}`\n${}",
  declare_text: "text ${textName} = `${value}`\n${}",
};

export const getQuickSnippetTemplate = (
  view: EditorView,
  type: string
): {
  template: string;
  from: number;
  to: number;
} => {
  const snippetTemplate = quickSnippetTemplates[type || ""];
  if (!view || !type || !snippetTemplate) {
    return { template: undefined, from: undefined, to: undefined };
  }
  const state = view?.state;
  const mainSelection = state.selection.main;
  const anchor = mainSelection?.anchor;
  const head = mainSelection?.head;
  const from = Math.min(anchor, head);
  const to = Math.max(anchor, head);
  const doc = state?.doc;
  const selectedText = doc.sliceString(from, to);
  const endsWithNewline = snippetTemplate.endsWith("\n${}");
  const startsWithNewline = snippetTemplate.startsWith("\n");
  const fromLine = doc.lineAt(from);
  const beforeLineFrom = fromLine.from - 1;
  const afterLineFrom = fromLine.to + 1;
  const beforeLine =
    beforeLineFrom >= 0 ? doc.lineAt(beforeLineFrom) : undefined;
  const afterLine =
    afterLineFrom <= doc.length - 1 ? doc.lineAt(afterLineFrom) : undefined;
  const isLineEmpty = !fromLine.text.trim();
  const isLineBeforeEmpty = !beforeLine?.text?.trim();
  const isLineAfterEmpty = !afterLine?.text?.trim();
  const snippetFrom = Math.min(
    state.doc.length,
    !endsWithNewline || isLineEmpty ? from : afterLineFrom
  );
  const snippetTo = Math.min(
    state.doc.length,
    !endsWithNewline || isLineEmpty ? to : afterLineFrom
  );
  // Insert selected text if necessary
  let formattedTemplate = snippetTemplate.replace("{selection}", selectedText);
  if (startsWithNewline) {
    if (!isLineEmpty && afterLineFrom > doc.length - 1) {
      formattedTemplate = `\n${formattedTemplate}`;
    }
    if (isLineEmpty) {
      if (isLineBeforeEmpty) {
        // Line before is already blank, so no need to start with newline
        formattedTemplate = formattedTemplate.replace(/^[\n]*/, "");
      }
    }
  }
  if (endsWithNewline) {
    if (isLineEmpty) {
      if (isLineAfterEmpty) {
        // Line after is already blank, so no need to end with newline
        formattedTemplate = formattedTemplate.replace(/[\n][$][{][}]$/, "${}");
      }
    }
  }
  return { template: formattedTemplate, from: snippetFrom, to: snippetTo };
};

export const quickSnippet = (view: EditorView, type: string): void => {
  const snippetTemplate = quickSnippetTemplates[type || ""];
  if (!view || !type || !snippetTemplate) {
    return;
  }
  const state = view?.state;
  const { template, from, to } = getQuickSnippetTemplate(view, type);
  const dispatch = view?.dispatch;
  const s = snippet(template);
  s({ state, dispatch }, undefined, from, to);
};
