import { getStack } from "@impower/textmate-grammar-tree/src/tree/utils/getStack";
import { SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";
import {
  ARIA_ATTRIBUTE_ALIASES,
  ATTRIBUTE_PROPS,
  BOOLEAN_ATTRIBUTES,
  DATA_ATTRIBUTE_PROPS,
  toDataAttributeName,
} from "@impower/sparkdown/src/compiler/constants/dataAttributeProps";
import { type SparkdownNodeName } from "@impower/sparkdown/src/compiler/types/SparkdownNodeName";
import { type Tree } from "@lezer/common";
import { MarkupKind, type Hover, type Position } from "vscode-languageserver";

export const SELECTABLE_PROPS: readonly string[] = [
  ...new Set([...DATA_ATTRIBUTE_PROPS, ...ARIA_ATTRIBUTE_ALIASES.keys(), ...ATTRIBUTE_PROPS]),
];

const PROP_OF_ATTRIBUTE: ReadonlyMap<string, string> = new Map(
  SELECTABLE_PROPS.map((prop) => [toDataAttributeName(prop), prop]),
);

export const isValuelessAttribute = (attribute: string) => BOOLEAN_ATTRIBUTES.has(attribute);

export const propOfAttribute = (attribute: string) => PROP_OF_ATTRIBUTE.get(attribute);

export const labelKindOfProp = (prop: string | undefined) =>
  prop === "variant" || prop === "speaker" ? prop : undefined;

const PROP_MEANINGS: ReadonlyMap<string, (written: string, value: string) => string> = new Map([
  [
    "variant",
    (written: string, value: string) =>
      `In a layout, \`#variant=${written}\` limits an element to lines labelled \`${value}\` in their cue's brackets, as \`BUNNY [${value}]:\` is labelled \`${value}\`. \`[<]\` is \`left\` and \`[>]\` is \`right\`.`,
  ],
  [
    "speaker",
    (written: string, value: string) =>
      `In a layout, \`#speaker=${written}\` limits an element to lines spoken by the character defined as \`${value}\`.`,
  ],
  [
    "tooltip",
    (written: string) =>
      `\`#tooltip=${written}\` shows its text in a bubble while the pointer is over the element.`,
  ],
]);

const OPERATOR_MATCHES: Record<string, string> = {
  "=": "is",
  "~=": "has the word",
  "|=": "is, or starts with a dash after,",
  "^=": "starts with",
  "$=": "ends with",
  "*=": "contains",
};

const VARIANTS_GUIDE =
  "https://github.com/ImpowerGames/impower/blob/main/packages/sparkdown/docs/guide/Variants.md#styling-by-variant-and-speaker";

const guideLink = (prop: string | undefined) =>
  labelKindOfProp(prop) ? [`[Styling by variant and speaker](${VARIANTS_GUIDE})`] : [];

export const selectorPropDocumentation = (prop: string) =>
  [
    isValuelessAttribute(prop)
      ? `\`#${prop} { … }\` selects the elements written with a \`#${prop}\` prop.`
      : `\`#${prop}=name { … }\` selects the elements written with \`#${prop}=name\`.`,
    ...(PROP_MEANINGS.has(prop) ? [PROP_MEANINGS.get(prop)!("name", "name")] : []),
    ...guideLink(prop),
  ].join("\n\n");

export const selectorAttributeDocumentation = (attribute: string) => {
  const prop = propOfAttribute(attribute);
  return [
    `\`[${attribute}] { … }\` selects the elements that have a \`${attribute}\` attribute.`,
    ...(prop && prop !== attribute ? [`A \`#${prop}\` prop writes this attribute.`] : []),
  ].join("\n\n");
};

const unquote = (value: string) =>
  /^(["']).*\1$/s.test(value) ? value.slice(1, -1) : value;

const PROP_SELECTOR = /^#([^\s~|^$*=]+)(?:([~|^$*]?=)(.*))?$/s;

const ATTRIBUTE_SELECTOR =
  /^\[\s*([^\s~|^$*=\]]+)\s*(?:([~|^$*]?=)\s*("(?:\\[^]|[^"\\])*"|'(?:\\[^]|[^'\\])*'|(?:\\[^]|[^\s\]\\])*)(?:\s*([iIsS]))?)?\s*\]$/;

const describeProp = (written: string): string | null => {
  const match = PROP_SELECTOR.exec(written);
  if (!match) {
    return null;
  }
  const [, prop = "", operator, raw = ""] = match;
  const value = unquote(raw);
  const selects = !operator
    ? `\`${written} { … }\` selects the elements written with a \`#${prop}\` prop.`
    : operator === "="
      ? `\`${written} { … }\` selects the elements written with \`#${prop}=${raw}\`.`
      : `\`${written} { … }\` selects the elements written with a \`#${prop}\` prop whose value ${OPERATOR_MATCHES[operator]} \`${value}\`.`;
  const meaning = operator === "=" && value ? PROP_MEANINGS.get(prop)?.(raw, value) : undefined;
  return [selects, ...(meaning ? [meaning] : []), ...guideLink(prop)].join("\n\n");
};

const describeAttribute = (written: string): string | null => {
  const match = ATTRIBUTE_SELECTOR.exec(written);
  if (!match) {
    return null;
  }
  const [, attribute = "", operator, raw = "", flag = ""] = match;
  const value = unquote(raw);
  const ignoresCase = flag.toLowerCase() === "i";
  const selects = !operator
    ? `\`${written} { … }\` selects the elements that have a \`${attribute}\` attribute.`
    : `\`${written} { … }\` selects the elements whose \`${attribute}\` attribute ${OPERATOR_MATCHES[operator]} \`${value}\`${ignoresCase ? ", ignoring case" : ""}.`;
  const shown = operator ? `${operator}${raw}` : "";
  const prop = propOfAttribute(attribute);
  const writtenBy =
    prop && prop !== attribute
      ? ignoresCase
        ? `A \`#${prop}\` prop writes this attribute.`
        : `\`#${prop}${shown}\` writes this attribute, so \`#${prop}${shown} { … }\` selects the same elements.`
      : undefined;
  const renamed = toDataAttributeName(attribute);
  const misnamed =
    renamed !== attribute
      ? ignoresCase
        ? `A \`#${attribute}\` prop writes \`${renamed}\`, not \`${attribute}\`, so this block selects no element written with it.`
        : `\`#${attribute}${shown}\` writes \`${renamed}\`, not \`${attribute}\`, so this block selects no element written with it; \`#${attribute}${shown} { … }\` does.`
      : undefined;
  const meaning =
    operator === "=" && value && prop && !ignoresCase ? PROP_MEANINGS.get(prop)?.(raw, value) : undefined;
  return [
    selects,
    ...(writtenBy ? [writtenBy] : []),
    ...(misnamed ? [misnamed] : []),
    ...(meaning && !misnamed ? [meaning] : []),
    ...guideLink(prop),
  ].join("\n\n");
};

export const getSelectorAttributeHover = (
  document: SparkdownDocument,
  tree: Tree,
  position: Position,
): Hover | null => {
  const offset = document.offsetAt(position);
  const stack = getStack<SparkdownNodeName>(tree, offset, 1);
  if (
    !stack.some((node) => node.name === "LuauStyle") ||
    !stack.some((node) => node.name === "LuauStructBlockKey")
  ) {
    return null;
  }
  const prop = stack.find((node) => node.name === "StyleAttribute");
  const bracket = prop ? undefined : stack.find((node) => node.name === "LuauStructBlockKeyBracket");
  const node = prop ?? bracket;
  if (!node) {
    return null;
  }
  const written = document.getText(document.range(node.from, node.to));
  const value = prop ? describeProp(written) : describeAttribute(written);
  if (!value) {
    return null;
  }
  return {
    contents: { kind: MarkupKind.Markdown, value },
    range: document.range(node.from, node.to),
  };
};
