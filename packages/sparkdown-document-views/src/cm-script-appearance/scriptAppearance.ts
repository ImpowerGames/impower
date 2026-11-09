import { autocompletion } from "@codemirror/autocomplete";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { Compartment, Extension, StateEffect } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { autoCloseBrackets } from "@impower/codemirror-vscode-language/src";
import {
  documentHighlights,
  hoverPreviews,
} from "@impower/codemirror-vscode-lsp-client/src";
import { tags } from "@lezer/highlight";
import { indentationGuides } from "../cm-indentation-guides/indentationGuides";
import {
  DECLARED_NAME_ROLE,
  scriptRole,
  scriptRoles,
} from "../cm-script-roles/scriptRoles";
import type { ScriptAppearance } from "./scriptAppearanceOptions";

type ScriptAppearanceOption = keyof ScriptAppearance;

const editorClass = (className: string) =>
  EditorView.editorAttributes.of({ class: className });

const ITALIC_COMMENTS = HighlightStyle.define([
  {
    tag: [tags.comment, tags.lineComment, tags.blockComment, tags.docComment],
    fontStyle: "italic",
  },
]);

const EMPHASIZED_MARKUP = HighlightStyle.define([
  { tag: tags.quote, fontStyle: "italic" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "bold" },
  { tag: tags.link, textDecoration: "underline", textUnderlineOffset: "5px" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
]);

const BOLD_CONTAINER_NAMES = HighlightStyle.define([
  { tag: tags.className, fontWeight: "bold" },
]);

const OPTION_EXTENSIONS: {
  readonly [K in ScriptAppearanceOption]: (
    value: ScriptAppearance[K],
  ) => Extension;
} = {
  boldDeclarationNames: (on) => (on ? scriptRole.of(DECLARED_NAME_ROLE) : []),
  boldSpeakerNames: (on) => (on ? editorClass("cm-bold-speakers") : []),
  boldContainerNames: (on) =>
    on ? syntaxHighlighting(BOLD_CONTAINER_NAMES) : [],
  tintedDialogue: (on) => (on ? editorClass("cm-tinted-dialogue") : []),
  italicComments: (on) => (on ? syntaxHighlighting(ITALIC_COMMENTS) : []),
  emphasizeMarkup: (on) => (on ? syntaxHighlighting(EMPHASIZED_MARKUP) : []),
  highlightMatchingSymbols: (on) => documentHighlights.of(on),
  hoverPreviews: (on) => hoverPreviews.of(on),
  lineNumbers: (on) => (on ? editorClass("cm-line-numbers") : []),
  indentGuides: (mode) => (mode === "off" ? [] : indentationGuides({ mode })),
  autoCloseBrackets: (on) => autoCloseBrackets.of(on),
  suggestAutocompletions: (on) =>
    on ? [] : autocompletion({ activateOnTyping: false }),
};

const OPTIONS = Object.keys(OPTION_EXTENSIONS) as ScriptAppearanceOption[];

const compartments = Object.fromEntries(
  OPTIONS.map((option) => [option, new Compartment()]),
) as Record<ScriptAppearanceOption, Compartment>;

const optionExtension = <K extends ScriptAppearanceOption>(
  appearance: ScriptAppearance,
  option: K,
) => OPTION_EXTENSIONS[option](appearance[option]);

export const ROLE_SYNTAX_VARIABLES = {
  speaker: "--syntax-speaker",
  dialogue: "--syntax-dialogue-untinted",
  tintedDialogue: "--syntax-dialogue",
} as const;

const scriptAppearanceTheme = EditorView.baseTheme({
  "& .cm-role-speaker": {
    color: `var(${ROLE_SYNTAX_VARIABLES.speaker})`,
  },
  "& .cm-role-dialogue": {
    color: `var(${ROLE_SYNTAX_VARIABLES.dialogue})`,
  },
  "&.cm-tinted-dialogue .cm-role-dialogue": {
    color: `var(${ROLE_SYNTAX_VARIABLES.tintedDialogue})`,
  },
  "&.cm-bold-speakers .cm-role-speaker": {
    fontWeight: "bold",
  },
  "& .cm-role-declared": {
    fontWeight: "bold",
  },
});

export const scriptAppearance = (appearance: ScriptAppearance): Extension => [
  scriptRoles(),
  scriptAppearanceTheme,
  OPTIONS.map((option) =>
    compartments[option].of(optionExtension(appearance, option)),
  ),
];

const reconfigureScriptAppearance = (
  previous: ScriptAppearance,
  next: ScriptAppearance,
): StateEffect<unknown>[] =>
  OPTIONS.filter((option) => previous[option] !== next[option]).map((option) =>
    compartments[option].reconfigure(optionExtension(next, option)),
  );

export const setScriptAppearance = (
  view: EditorView,
  previous: ScriptAppearance,
  next: ScriptAppearance,
) => {
  const effects = reconfigureScriptAppearance(previous, next);
  if (effects.length > 0) {
    view.dispatch({ effects });
  }
};
