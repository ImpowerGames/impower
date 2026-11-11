import {
  autoClosingPairFor,
  type AutoClosingPair,
} from "../../../packages/codemirror-vscode-language/src/utils/autoClosingPairFor";

export interface PairConfig {
  autoClosingPairs?: readonly AutoClosingPair[];
}

export interface TypedCursor {
  lineBefore: string;
  lineAfter: string;
}

export const closesByLanguage = (
  configs: Readonly<Record<string, PairConfig>>,
  documentLanguage: string,
  cursors: readonly TypedCursor[],
  insert: string,
  canClose: (
    pair: AutoClosingPair,
    language: string,
    lineAfter: string,
  ) => boolean,
  languageAt: (cursorIndex: number) => string,
): (string | null)[] | undefined => {
  const languages = Object.keys(configs);
  const closeIn = (language: string, cursor: TypedCursor) => {
    const configLanguage = configs[language] ? language : documentLanguage;
    const match = autoClosingPairFor(
      configs[configLanguage]?.autoClosingPairs ?? [],
      insert,
      cursor.lineBefore,
      cursor.lineAfter,
    );
    return match && canClose(match.pair, configLanguage, cursor.lineAfter)
      ? match.close
      : null;
  };
  let differs = false;
  const closes = cursors.map((cursor, index) => {
    const native = closeIn(documentLanguage, cursor);
    if (languages.every((language) => closeIn(language, cursor) === native)) {
      return native;
    }
    const close = closeIn(languageAt(index), cursor);
    differs ||= close !== native;
    return close;
  });
  return differs ? closes : undefined;
};
