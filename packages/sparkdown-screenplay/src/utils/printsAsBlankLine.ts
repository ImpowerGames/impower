const SCREENPLAY_ELEMENT_NODES: ReadonlySet<string> = new Set([
  "FrontMatter",
  "Scene",
  "Branch",
  "BlockTitle",
  "InlineTitle",
  "BlockHeading",
  "InlineHeading",
  "BlockTransitional",
  "InlineTransitional",
  "BlockWrite",
  "InlineWrite",
  "BlockDialogue",
  "InlineDialogue",
  "BlockAction",
  "InlineAction",
  "ImplicitAction",
  "Choice",
  "Newline",
  "Whitespace",
]);

export const printsAsBlankLine = (
  name: string,
  parentName: string | undefined,
): boolean =>
  parentName === "sparkdown" && !SCREENPLAY_ELEMENT_NODES.has(name);
