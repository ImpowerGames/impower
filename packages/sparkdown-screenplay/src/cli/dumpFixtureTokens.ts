import { TextmateGrammarParser } from "../../../textmate-grammar-tree/src/tree/classes/TextmateGrammarParser";
import GRAMMAR_DEFINITION from "../../../sparkdown/language/sparkdown.language-grammar.json";

const FIXTURE =
  `INT. KITCHEN - NIGHT\n` +
  `\n` +
  `Bunny enters.\n` +
  `\n` +
  `He looks around. He sits down.\n`;

const parser = new TextmateGrammarParser(GRAMMAR_DEFINITION);
const tree = parser.parse(FIXTURE);

console.log(`docLen=${FIXTURE.length}`);
console.log("Newline nodes only:");
tree.iterate({
  enter: (node) => {
    if (node.name === "Newline" || node.name === "BlockLineBlank") {
      console.log(
        `  ${node.name} [${node.from}..${node.to}]`,
      );
    }
  },
});
