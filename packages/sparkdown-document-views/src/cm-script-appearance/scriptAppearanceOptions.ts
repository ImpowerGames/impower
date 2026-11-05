export const INDENT_GUIDES = ["off", "block", "all"] as const;

export type IndentGuides = (typeof INDENT_GUIDES)[number];

export interface ScriptAppearance {
  readonly boldDeclarationNames: boolean;
  readonly boldSpeakerNames: boolean;
  readonly boldContainerNames: boolean;
  readonly tintedDialogue: boolean;
  readonly italicComments: boolean;
  readonly emphasizeMarkup: boolean;
  readonly highlightMatchingSymbols: boolean;
  readonly hoverPreviews: boolean;
  readonly lineNumbers: boolean;
  readonly indentGuides: IndentGuides;
  readonly autoCloseBrackets: boolean;
}
