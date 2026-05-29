import { TextmateGrammarParser } from "../../../textmate-grammar-tree/src/tree/classes/TextmateGrammarParser";
import GRAMMAR_DEFINITION from "../../../sparkdown/language/sparkdown.language-grammar.json";
import ScreenplayParser from "../classes/ScreenplayParser";

// Mirrors the exact case the user described as their root cause:
// dialogue block ends with an empty line at the SAME indentation level as
// the dialogue text (6 spaces in their script). The previous parser
// treated this as content because `BlockLineBlank > Indent` has `to > from`.
const FIXTURE =
  `    BUNNY:\n` +
  `      [[bunny_realization~jacket]]\n` +
  `      <!>(realizing)\n` +
  `      Oh! >\n` +
  `      [[bunny_point~jacket]]\n` +
  `      That weird baseball show.\n` +
  `      \n` +
  `    RAFFLES:\n` +
  `      [[raffles_offended~coat]]\n` +
  `      Cricket, Bunny!  Cricket!! >\n` +
  `      [[raffles_sigh~coat]]\n` +
  `      Jesus...\n`;

const tokens = new ScreenplayParser().parse(FIXTURE);
console.log("=== TOKENS ===");
for (const t of tokens) {
  console.log(`tag=${t.tag} text=${JSON.stringify(t.text ?? "")}`);
}

console.log("\n=== TREE ===");
const parser = new TextmateGrammarParser(GRAMMAR_DEFINITION);
const tree = parser.parse(FIXTURE + "\n\n");
const indent = (n: number) => "  ".repeat(n);
let depth = 0;
tree.iterate({
  enter: (node) => {
    const text = FIXTURE.slice(node.from, Math.min(node.to, node.from + 30));
    console.log(
      `${indent(depth)}${node.name} [${node.from}..${node.to}] ${JSON.stringify(
        text,
      )}`,
    );
    depth++;
  },
  leave: () => {
    depth--;
  },
});
