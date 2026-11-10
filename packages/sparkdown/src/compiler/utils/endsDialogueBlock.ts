import GRAMMAR_DEFINITION from "../../../language/sparkdown.language-grammar.json";

const CUE_INDENT = String.raw`\1`;

export const DIALOGUE_BLOCK_END: string =
  GRAMMAR_DEFINITION.repository.BlockDialogue.end;

const endPatterns = new Map<string, RegExp>();

const endPatternFor = (cueIndent: string): RegExp => {
  let pattern = endPatterns.get(cueIndent);
  if (!pattern) {
    if (!/^[ \t]*$/.test(cueIndent)) {
      throw new Error(`A cue indent is spaces and tabs, not ${JSON.stringify(cueIndent)}`);
    }
    pattern = new RegExp(DIALOGUE_BLOCK_END.split(CUE_INDENT).join(cueIndent));
    endPatterns.set(cueIndent, pattern);
  }
  return pattern;
};

export const endsDialogueBlock = (line: string, cueIndent: string): boolean =>
  endPatternFor(cueIndent).test(line);
