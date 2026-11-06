import type { ScriptAppearance } from "../../src/cm-script-appearance/scriptAppearanceOptions";

export const ALL_OFF_APPEARANCE: ScriptAppearance = {
  boldDeclarationNames: false,
  boldSpeakerNames: false,
  boldContainerNames: false,
  tintedDialogue: false,
  italicComments: false,
  emphasizeMarkup: false,
  highlightMatchingSymbols: false,
  hoverPreviews: false,
  lineNumbers: false,
  indentGuides: "off",
  autoCloseBrackets: false,
  suggestAutocompletions: false,
};

export const ALL_ON_APPEARANCE: ScriptAppearance = {
  boldDeclarationNames: true,
  boldSpeakerNames: true,
  boldContainerNames: true,
  tintedDialogue: true,
  italicComments: true,
  emphasizeMarkup: true,
  highlightMatchingSymbols: true,
  hoverPreviews: true,
  lineNumbers: true,
  indentGuides: "all",
  autoCloseBrackets: true,
  suggestAutocompletions: true,
};
