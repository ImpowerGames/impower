import { TextmateGrammarParser } from "../../../textmate-grammar-tree/src/tree/classes/TextmateGrammarParser";
import GRAMMAR_DEFINITION from "../../../sparkdown/language/sparkdown.language-grammar.json";

// Mirror the user's report:
const FIXTURE =
  `    RAFFLES:\n` +
  `      [[raffles_confident~coat]]\n` +
  `      (tucking scripts away)\n` +
  `      Oh Bunny,  we're not going to DDP... >\n` +
  `      [[raffles_flirty~coat]]\n` +
  `      I said Danby and I were close,  didn't I? >\n` +
  `      [[raffles_happy~coat]]\n` +
  `      We'll just pop by for a visit!\n` +
  `      \n` +
  `    He ((sfx_shoes_stopping)) stops and gestures to...\n`;

const parser = new TextmateGrammarParser(GRAMMAR_DEFINITION);
const tree = parser.parse(FIXTURE + "\n\n");

const indent = (n: number) => "  ".repeat(n);
let depth = 0;
tree.iterate({
  enter: (node) => {
    const text = FIXTURE.slice(node.from, Math.min(node.to, node.from + 50));
    console.log(
      `${indent(depth)}${node.name} [${node.from}..${node.to}] ${JSON.stringify(text)}`,
    );
    depth++;
  },
  leave: () => {
    depth--;
  },
});
