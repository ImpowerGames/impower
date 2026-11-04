import {
  identName,
  isCurlyBlock,
  isTokenType,
  parseComponentValues,
  significant,
  TokenType,
  type ComponentValue,
} from "./cssSyntax.js";

const collectDeclarations = (
  nodes: ComponentValue[],
  variables: Set<string>,
): void => {
  let item: ComponentValue[] = [];
  const close = () => {
    const [name, colon] = significant(item);
    const variable = identName(name);
    if (
      variable?.startsWith("--theme-") &&
      isTokenType(colon, TokenType.Colon)
    ) {
      variables.add(variable);
    }
    item = [];
  };
  for (const node of nodes) {
    if (isTokenType(node, TokenType.Semicolon)) {
      close();
      continue;
    }
    if (isCurlyBlock(node)) {
      collectDeclarations(node.value, variables);
      close();
      continue;
    }
    item.push(node);
  }
  close();
};

export const getThemeVariables = (...cssTexts: string[]): Set<string> => {
  const variables = new Set<string>();
  for (const cssText of cssTexts) {
    collectDeclarations(parseComponentValues(cssText), variables);
  }
  return variables;
};
