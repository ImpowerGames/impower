import { type Tree } from "@lezer/common";
import { type Grammar } from "../../grammar/classes/Grammar";

export type EmbeddedLanguages = Readonly<Record<string, string>>;

export interface DocumentText {
  readonly length: number;
  sliceString(from: number, to: number): string;
}

export interface LanguageReader {
  character(tree: Tree, offset: number, documentLanguage: string): string;
  cursor(
    tree: Tree,
    text: string | DocumentText,
    position: number,
    documentLanguage: string,
  ): string;
}

const CONTENT_SUFFIX = "_content";

const languageOfScope = (
  scope: string,
  keys: readonly string[],
  embeddedLanguages: EmbeddedLanguages,
): string | undefined => {
  for (const key of keys) {
    if (
      scope === key ||
      (scope.startsWith(key) && scope[key.length] === ".")
    ) {
      return embeddedLanguages[key];
    }
  }
  return undefined;
};

const languageOfScopeName = (
  scopeName: string,
  keys: readonly string[],
  embeddedLanguages: EmbeddedLanguages,
): string | undefined => {
  const parts = scopeName.split(/\s+/);
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    if (!part) continue;
    const language = languageOfScope(part, keys, embeddedLanguages);
    if (language !== undefined) return language;
  }
  return undefined;
};

const charAt = (text: string | DocumentText, index: number): string =>
  typeof text === "string" ? text.charAt(index) : text.sliceString(index, index + 1);

const cursorCharacter = (
  text: string | DocumentText,
  position: number,
): number | null => {
  if (position < text.length && charAt(text, position) !== "\n") {
    return position;
  }
  if (position > 0 && charAt(text, position - 1) !== "\n") {
    return position - 1;
  }
  if (position < text.length) return position;
  return position > 0 ? position - 1 : null;
};

export const createLanguageReader = (
  grammar: Grammar,
  embeddedLanguages: EmbeddedLanguages,
): LanguageReader => {
  const keys = Object.keys(embeddedLanguages).sort().reverse();
  const nameByNode = new Map<string, string>();
  const contentNameByNode = new Map<string, string>();
  for (const node of grammar.nodes) {
    const { name, contentName } = node.props;
    if (typeof name === "string") nameByNode.set(node.typeId, name);
    if (typeof contentName === "string") {
      contentNameByNode.set(node.typeId, contentName);
    }
  }
  const languageByNode = new Map<string, string | null>();
  const languageOfNode = (nodeName: string): string | null => {
    const cached = languageByNode.get(nodeName);
    if (cached !== undefined) return cached;
    let scopeName = nameByNode.get(nodeName);
    if (scopeName === undefined && nodeName.endsWith(CONTENT_SUFFIX)) {
      scopeName = contentNameByNode.get(
        nodeName.slice(0, -CONTENT_SUFFIX.length),
      );
    }
    const language =
      scopeName === undefined
        ? null
        : (languageOfScopeName(scopeName, keys, embeddedLanguages) ?? null);
    languageByNode.set(nodeName, language);
    return language;
  };
  const character: LanguageReader["character"] = (
    tree,
    offset,
    documentLanguage,
  ) => {
    for (
      let node: ReturnType<Tree["resolveInner"]> | null = tree.resolveInner(
        offset,
        1,
      );
      node;
      node = node.parent
    ) {
      const language = languageOfNode(node.name);
      if (language !== null) return language;
    }
    return documentLanguage;
  };
  return {
    character,
    cursor: (tree, text, position, documentLanguage) => {
      const offset = cursorCharacter(text, position);
      return offset === null
        ? documentLanguage
        : character(tree, offset, documentLanguage);
    },
  };
};
