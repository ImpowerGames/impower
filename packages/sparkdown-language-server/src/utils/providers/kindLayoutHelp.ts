import { type SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";
import { type SparkdownNodeName } from "@impower/sparkdown/src/compiler/types/SparkdownNodeName";
import { type SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { walkLayoutTree } from "@impower/sparkdown/src/compiler/utils/layoutTree";
import { elementNames } from "@impower/sparkdown/src/compiler/utils/variantLayouts";
import { getStack } from "@impower/textmate-grammar-tree/src/tree/utils/getStack";
import { type Tree } from "@lezer/common";
import { MarkupKind, type Hover, type Position } from "vscode-languageserver";

const SCREENS_GUIDE =
  "https://github.com/ImpowerGames/impower/blob/main/packages/sparkdown/docs/guide/Screens.md#61-the-main-layout";

const BUILT_IN_KINDS: ReadonlyMap<string, string> = new Map([
  ["dialogue", "A dialogue line"],
  ["action", "An action line"],
  ["title", "A title (`^:`)"],
  ["heading", "A scene heading (`$:`)"],
  ["transitional", "A transition (`%:`)"],
  ["choices", "A menu"],
]);

const MENU_LAYOUT = "choices";

const namedAfterKind = (program: SparkProgram | undefined, name: string): boolean => {
  if (BUILT_IN_KINDS.has(name)) {
    return true;
  }
  const layout = program?.sparkle?.layouts?.[name];
  if (!program || !layout || name === "main") {
    return false;
  }
  return walkLayoutTree(program.sparkle, name, ({ node }) => elementNames(node).includes(name));
};

export const kindLayoutDocumentation = (name: string): string => {
  if (name === MENU_LAYOUT) {
    return [
      "`choices` opens by itself when a menu comes up and no open layout holds its option buttons, the elements named `choice`. The line that asks the question stays in its own layout.",
      "It closes when an option is picked. `[[open choices]]` keeps it open until `[[close choices]]`.",
      `[Screens](${SCREENS_GUIDE})`,
    ].join("\n\n");
  }
  const line = BUILT_IN_KINDS.get(name) ?? `A line written with \`@${name}:\``;
  return [
    `\`${name}\` is named after a kind of text, so it opens by itself. ${line} opens it when no open layout holds an element named \`${name}\`, and goes to every open layout that does.`,
    `It closes when the next line belongs in a different layout, or at a beat that shows no text. \`[[open ${name}]]\` keeps it open until \`[[close ${name}]]\`.`,
    `[Screens](${SCREENS_GUIDE})`,
  ].join("\n\n");
};

export const getKindLayoutHover = (
  document: SparkdownDocument,
  tree: Tree,
  position: Position,
  program: SparkProgram | undefined,
): Hover | null => {
  const offset = document.offsetAt(position);
  const stack = getStack<SparkdownNodeName>(tree, offset, 1);
  const name = stack.find((node) => node.name === "LuauDefineName");
  if (!name || !stack.some((node) => node.name === "LuauLayoutNameAndInheritance")) {
    return null;
  }
  const text = document.read(name.from, name.to).trim();
  if (!namedAfterKind(program, text)) {
    return null;
  }
  return {
    contents: { kind: MarkupKind.Markdown, value: kindLayoutDocumentation(text) },
    range: document.range(name.from, name.to),
  };
};
