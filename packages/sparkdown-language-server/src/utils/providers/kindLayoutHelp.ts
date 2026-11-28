import { type SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";
import { type SparkdownNodeName } from "@impower/sparkdown/src/compiler/types/SparkdownNodeName";
import { type SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { type ElementNode } from "@impower/sparkdown/src/compiler/types/SparkleNode";
import { isTemplated } from "@impower/sparkdown/src/compiler/utils/layoutStreams";
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

const holdsElement = (program: SparkProgram, children: unknown, name: string, shared = false): boolean => {
  const components = program.sparkle?.components ?? {};
  const expanded = new Set<string>();
  const visit = (value: unknown): boolean => {
    if (Array.isArray(value)) {
      return value.some(visit);
    }
    if (!value || typeof value !== "object") {
      return false;
    }
    const node = value as Record<string, unknown>;
    if (node["kind"] === "element") {
      if (shared && isTemplated(node as unknown as ElementNode)) {
        return false;
      }
      const classes = Array.isArray(node["classes"]) ? node["classes"] : [];
      if ([node["tag"], node["name"], ...classes].includes(name)) {
        return true;
      }
      const tag = node["tag"];
      const component = typeof tag === "string" ? components[tag] : undefined;
      if (component && !expanded.has(tag as string)) {
        expanded.add(tag as string);
        if (visit(component.children)) {
          return true;
        }
      }
    }
    return Object.values(node).some((child) => child !== null && typeof child === "object" && visit(child));
  };
  return visit(children);
};

const namedAfterKind = (program: SparkProgram | undefined, name: string): boolean => {
  if (BUILT_IN_KINDS.has(name)) {
    return true;
  }
  const layout = program?.sparkle?.layouts?.[name];
  if (!program || !layout || name === "main") {
    return false;
  }
  const screen = layout.screen ? program.sparkle?.screens?.[layout.screen] : undefined;
  return holdsElement(program, layout.children, name) || holdsElement(program, screen?.children, name, true);
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
