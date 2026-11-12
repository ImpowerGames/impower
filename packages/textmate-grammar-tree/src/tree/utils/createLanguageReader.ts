import { type NodeType, type Tree } from "@lezer/common";
import { type Grammar } from "../../grammar/classes/Grammar";
import { expandedScopeOf } from "./expandedScope";

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

const isLineBreak = (text: string | DocumentText, index: number): boolean => {
  const c = charAt(text, index);
  return c === "\n" || c === "\r";
};

const cursorCharacter = (
  text: string | DocumentText,
  position: number,
): number | null => {
  if (position < text.length && !isLineBreak(text, position)) {
    return position;
  }
  if (position > 0 && !isLineBreak(text, position - 1)) {
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
  const loadedTypes = grammar.loadedTypes;
  const nameByNode = new Map<string, string>();
  for (let i = 0; i < loadedTypes; i++) {
    const node = grammar.nodes[i]!;
    const { name } = node.props;
    if (typeof name === "string") nameByNode.set(node.typeId, name);
  }
  const languageByNode = new Map<string, string | null>();
  const languageByExpandedType = new WeakMap<NodeType, string | null>();
  const languageOf = (scopeName: string | undefined): string | null =>
    scopeName === undefined
      ? null
      : (languageOfScopeName(scopeName, keys, embeddedLanguages) ?? null);
  const languageOfNode = (type: NodeType): string | null => {
    if (type.id >= loadedTypes) {
      const cached = languageByExpandedType.get(type);
      if (cached !== undefined) return cached;
      const language = languageOf(expandedScopeOf(type));
      languageByExpandedType.set(type, language);
      return language;
    }
    const cached = languageByNode.get(type.name);
    if (cached !== undefined) return cached;
    const language = languageOf(nameByNode.get(type.name));
    languageByNode.set(type.name, language);
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
      const language = languageOfNode(node.type);
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
