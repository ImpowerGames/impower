import { type SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";
import { type SparkdownNodeName } from "@impower/sparkdown/src/compiler/types/SparkdownNodeName";
import { type SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
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
  ["choices", "A menu with no line of its own"],
]);

const holdsElement = (value: unknown, name: string): boolean => {
  if (Array.isArray(value)) {
    return value.some((item) => holdsElement(item, name));
  }
  if (!value || typeof value !== "object") {
    return false;
  }
  const node = value as Record<string, unknown>;
  if (node["kind"] === "element" && (node["tag"] === name || node["name"] === name)) {
    return true;
  }
  return Object.values(node).some((child) => child !== null && typeof child === "object" && holdsElement(child, name));
};

const namedAfterKind = (program: SparkProgram | undefined, name: string): boolean => {
  if (BUILT_IN_KINDS.has(name)) {
    return true;
  }
  const layout = program?.sparkle?.layouts?.[name];
  return Boolean(layout && name !== "main" && holdsElement(layout.children, name));
};

export const kindLayoutDocumentation = (name: string): string => {
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
