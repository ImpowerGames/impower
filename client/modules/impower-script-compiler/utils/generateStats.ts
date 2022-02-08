import { ParsedChoice } from "../classes/ParsedHierarchy/ParsedChoice";
import { ParsedDivert } from "../classes/ParsedHierarchy/ParsedDivert";
import { ParsedGather } from "../classes/ParsedHierarchy/ParsedGather";
import { ParsedKnot } from "../classes/ParsedHierarchy/ParsedKnot";
import { ParsedStitch } from "../classes/ParsedHierarchy/ParsedStitch";
import { ParsedStory } from "../classes/ParsedHierarchy/ParsedStory";
import { ParsedText } from "../classes/ParsedHierarchy/ParsedText";
import { Stats } from "../types/Stats";

export const generateStats = (story: ParsedStory): Stats => {
  const stats = {
    words: 0,
    knots: 0,
    stitches: 0,
    functions: 0,
    choices: 0,
    gathers: 0,
    diverts: 0,
  };

  const allText = story.FindAll<ParsedText>((d) => d instanceof ParsedText);

  // Count all the words across all strings
  stats.words = 0;
  allText.forEach((text) => {
    let wordsInThisStr = 0;
    let wasWhiteSpace = true;
    for (let i = 0; i < text.text.length; i += 1) {
      const c = text.text[i];
      if (c === " " || c === "\t" || c === "\n" || c === "\r") {
        wasWhiteSpace = true;
      } else if (wasWhiteSpace) {
        wordsInThisStr += 1;
        wasWhiteSpace = false;
      }
    }

    stats.words += wordsInThisStr;
  });

  const knots = story.FindAll<ParsedKnot>((d) => d instanceof ParsedKnot);
  stats.knots = knots.length;

  stats.functions = 0;
  knots.forEach((knot) => {
    if (knot.isFunction) {
      stats.functions += 1;
    }
  });

  const stitches = story.FindAll<ParsedStitch>(
    (d) => d instanceof ParsedStitch
  );
  stats.stitches = stitches.length;

  const choices = story.FindAll<ParsedChoice>((d) => d instanceof ParsedChoice);
  stats.choices = choices.length;

  // Skip implicit gather that's generated at top of story
  // (we know which it is because it isn't assigned debug metadata)
  const gathers = story.FindAll<ParsedGather>(
    (g) => g instanceof ParsedGather && g.debugMetadata != null
  );
  stats.gathers = gathers.length;

  // May not be entirely what you expect.
  // Does it nevertheless have value?
  // Includes:
  //  - DONE, END
  //  - Function calls
  //  - Some implicitly generated weave diverts
  // But we subtract one for the implicit DONE
  // at the end of the main flow outside of knots.
  const diverts = story.FindAll<ParsedDivert>((d) => d instanceof ParsedDivert);
  stats.diverts = diverts.length - 1;

  return stats;
};
