import type { SyntaxNode } from "@lezer/common";

const CHOOSE_BLOCK = "LuauSparkdownChooseBlock";
const CHOOSE_CONTENT = "LuauSparkdownChooseBlock_content";
const THEN_CLAUSE = "LuauSparkdownChooseThenClause";
const CHOICE = "Choice";
const FUNCTION = "LuauFunctionDefinition";
const BRANCHES: ReadonlySet<string> = new Set([
  "LuauSparkdownElseifBlock",
  "LuauSparkdownElseBlock",
]);

const gather = (
  parent: SyntaxNode,
  options: SyntaxNode[],
  menu: boolean,
  enteredAfterOption: boolean,
): void => {
  let afterOption = enteredAfterOption;
  for (let child = parent.firstChild; child; child = child.nextSibling) {
    if (child.name === THEN_CLAUSE) {
      return;
    }
    if (child.name === CHOICE) {
      options.push(child);
      afterOption = true;
    } else if (BRANCHES.has(child.name)) {
      gather(child, options, false, enteredAfterOption);
    } else if (child.name === FUNCTION || (menu && afterOption)) {
      continue;
    } else if (child.name === CHOOSE_BLOCK) {
      if (!afterOption) {
        options.push(...chooseOptions(child));
      }
    } else {
      gather(child, options, false, afterOption);
    }
  }
};

export const chooseOptions = (block: SyntaxNode): SyntaxNode[] => {
  const options: SyntaxNode[] = [];
  const content = block.getChild(CHOOSE_CONTENT);
  if (content) {
    gather(content, options, true, false);
  }
  return options;
};

export const holdsOption = (
  options: readonly SyntaxNode[],
  node: { from: number; to: number },
): boolean =>
  options.some((option) => option.from >= node.from && option.to <= node.to);

export const optionBodyEnd = (
  options: readonly SyntaxNode[],
  choice: SyntaxNode,
): number => {
  for (let next = choice.nextSibling; next; next = next.nextSibling) {
    if (
      next.name === THEN_CLAUSE ||
      BRANCHES.has(next.name) ||
      holdsOption(options, next)
    ) {
      return next.from;
    }
  }
  return choice.parent?.to ?? choice.to;
};
