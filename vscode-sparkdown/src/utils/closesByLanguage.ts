export interface AutoClosingPair {
  open: string;
  close: string;
}

export interface PairConfig {
  autoClosingPairs?: readonly AutoClosingPair[];
  autoCloseBefore?: string;
  comments?: { blockComment?: readonly string[] };
}

export interface ClosingSettings {
  autoClosingBrackets: string;
  autoClosingQuotes: string;
  autoClosingComments: string;
}

export interface TypedCursor {
  lineBefore: string;
  lineAfter: string;
}

export interface AutoClose {
  open: string;
  close: string;
}

const QUOTES = "'\"`";
const DEFAULT_AUTO_CLOSE_BEFORE_QUOTES = ";:.,=}])> \n\t";
const DEFAULT_AUTO_CLOSE_BEFORE_BRACKETS = "'\"`;:.,=}])> \n\t";

const longest = (pairs: readonly AutoClosingPair[]) =>
  pairs.reduce<AutoClosingPair | undefined>(
    (result, pair) =>
      !result || pair.open.length > result.open.length ? pair : result,
    undefined,
  );

const isBeforeClosingBrace = (
  pairs: readonly AutoClosingPair[],
  lineAfter: string,
) =>
  !pairs.some((pair) => lineAfter.startsWith(pair.open)) &&
  pairs.some((pair) => lineAfter.startsWith(pair.close));

export const vscodeAutoClose = (
  config: PairConfig,
  settings: ClosingSettings,
  cursors: readonly TypedCursor[],
  ch: string,
): AutoClose | null => {
  const pairs = config.autoClosingPairs ?? [];
  const pair = longest(
    pairs.filter(
      ({ open }) =>
        open.endsWith(ch) &&
        cursors.every(({ lineBefore }) =>
          lineBefore.endsWith(open.slice(0, open.length - ch.length)),
        ),
    ),
  );
  if (!pair) {
    return null;
  }
  const blockCommentStart = config.comments?.blockComment?.[0];
  const kind = QUOTES.includes(ch)
    ? "quote"
    : blockCommentStart && pair.open.includes(blockCommentStart)
      ? "comment"
      : "bracket";
  const mode =
    kind === "quote"
      ? settings.autoClosingQuotes
      : kind === "comment"
        ? settings.autoClosingComments
        : settings.autoClosingBrackets;
  if (mode === "never") {
    return null;
  }
  const autoCloseBefore =
    config.autoCloseBefore ??
    (kind === "quote"
      ? DEFAULT_AUTO_CLOSE_BEFORE_QUOTES
      : DEFAULT_AUTO_CLOSE_BEFORE_BRACKETS);
  const shouldCloseBefore = (next: string) =>
    mode === "always" ||
    (mode === "beforeWhitespace"
      ? next === " " || next === "\t"
      : autoCloseBefore.includes(next));
  const containedClose =
    pair.open.length > 1
      ? (longest(
          pairs.filter(
            ({ open, close }) =>
              open !== pair.open &&
              pair.open.includes(open) &&
              pair.close.endsWith(close),
          ),
        )?.close ?? "")
      : "";
  let containedPresent = true;
  for (const { lineAfter } of cursors) {
    if (!lineAfter.startsWith(containedClose)) {
      containedPresent = false;
    }
    if (
      lineAfter.length > 0 &&
      !isBeforeClosingBrace(pairs, lineAfter) &&
      !shouldCloseBefore(lineAfter.charAt(0))
    ) {
      return null;
    }
  }
  return {
    open: pair.open,
    close: containedPresent
      ? pair.close.slice(0, pair.close.length - containedClose.length)
      : pair.close,
  };
};

export const closesByLanguage = (
  configs: Readonly<Record<string, PairConfig>>,
  documentLanguage: string,
  settings: ClosingSettings,
  cursors: readonly TypedCursor[],
  ch: string,
  languageAt: (cursorIndex: number) => string,
): (AutoClose | null)[] | undefined => {
  if (ch.length !== 1) {
    return undefined;
  }
  const opensAnywhere = Object.values(configs).some((config) =>
    (config.autoClosingPairs ?? []).some(
      ({ open }) =>
        open.endsWith(ch) &&
        cursors.some(({ lineBefore }) =>
          lineBefore.endsWith(open.slice(0, open.length - 1)),
        ),
    ),
  );
  if (!opensAnywhere) {
    return undefined;
  }
  const documentConfig = configs[documentLanguage] ?? {};
  const native = vscodeAutoClose(documentConfig, settings, cursors, ch);
  const languages = cursors.map((_, index) => {
    const language = languageAt(index);
    return configs[language] ? language : documentLanguage;
  });
  const closes: (AutoClose | null)[] = cursors.map(() => null);
  for (const language of new Set(languages)) {
    const indexes = languages.flatMap((l, index) =>
      l === language ? [index] : [],
    );
    const close = vscodeAutoClose(
      configs[language]!,
      settings,
      indexes.map((index) => cursors[index]!),
      ch,
    );
    for (const index of indexes) {
      closes[index] = close;
    }
  }
  return closes.every((close) => close?.close === native?.close)
    ? undefined
    : closes;
};
