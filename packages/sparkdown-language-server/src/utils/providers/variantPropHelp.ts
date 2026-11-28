import { type SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";
import { type SparkdownNodeName } from "@impower/sparkdown/src/compiler/types/SparkdownNodeName";
import { type SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { variantLayoutKinds } from "@impower/sparkdown/src/compiler/utils/variantLayouts";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { getStack } from "@impower/textmate-grammar-tree/src/tree/utils/getStack";
import { type Tree } from "@lezer/common";
import { MarkupKind, type Hover, type Position } from "vscode-languageserver";

const VARIANTS_GUIDE =
  "https://github.com/ImpowerGames/impower/blob/main/packages/sparkdown/docs/guide/Variants.md#a-layout-that-opens-for-a-variant";

const VALUE = /^#variant=(["']?)([\p{L}\p{N}_]+)\1$/u;

const listed = (words: readonly string[]) => {
  const named = words.map((word) => `\`${word}\``);
  return named.length > 1 ? `${named.slice(0, -1).join(", ")} or ${named.at(-1)}` : (named[0] ?? "");
};

export const variantPropDocumentation = (variant: string, layout: string, kinds: readonly string[]) =>
  [
    `\`#variant=${variant}\` limits this element to lines labelled \`${variant}\` in their cue's brackets, as \`BUNNY [${variant}]:\` is labelled \`${variant}\`. In a stream, a \`${variant}\` line makes its entry from this template ahead of a template with no \`#variant\`.`,
    ...(kinds.length > 0 && layout
      ? [
          `\`${layout}\` opens by itself for a \`${variant}\` line written to ${listed(kinds)}, as \`BUNNY [${variant}]:\` writes to \`dialogue\`, unless a layout you opened already holds that line, and closes at the first line that belongs in a different layout.`,
        ]
      : []),
    `[Variants](${VARIANTS_GUIDE})`,
  ].join("\n\n");

export const getVariantPropHover = (
  document: SparkdownDocument,
  tree: Tree,
  position: Position,
  program: SparkProgram | undefined,
): Hover | null => {
  const stack = getStack<SparkdownNodeName>(tree, document.offsetAt(position), 1);
  const name = stack.find((node) => node.name === "StyleAttributeName");
  const attribute = stack.find((node) => node.name === "LuauSparklePropAttribute");
  const layoutNode = stack.find((node) => node.name === "LuauLayout");
  if (!name || !attribute || !layoutNode || document.read(name.from, name.to) !== "variant") {
    return null;
  }
  const variant = VALUE.exec(document.read(attribute.from, attribute.to).trim())?.[2];
  if (!variant) {
    return null;
  }
  const nameNode = getDescendent("LuauDefineName", layoutNode);
  const layout = nameNode ? document.read(nameNode.from, nameNode.to).trim() : "";
  const kinds = layout ? variantLayoutKinds(program?.sparkle, layout, variant) : [];
  return {
    contents: { kind: MarkupKind.Markdown, value: variantPropDocumentation(variant, layout, kinds) },
    range: document.range(attribute.from, attribute.to),
  };
};
