import GRAMMAR from "../../language/sparkdown.language-grammar.json";

export type AssetReferenceKind = "backdrop" | "portrait" | "sound" | "music";

const GRAMMAR_RULES = GRAMMAR.repository as unknown as Record<string, { match?: string } | undefined>;

const whole = (rule: string) => {
  const match = GRAMMAR_RULES[rule]?.match;
  return match ? new RegExp(`^(?:${match})$`, "u") : /(?!)/u;
};

const ASSET_NAME = whole("AssetCommandFileName");

const NONE_KEYWORD = whole("AssetCommandKeywordNone");

const CLAUSE_KEYWORD = whole("AssetCommandClauseKeyword");

const ATTRIBUTE = /^[\p{L}\p{N}_][\p{L}\p{N}_.-]*$/u;

export const isWritableAssetName = (name: string): boolean =>
  ASSET_NAME.test(name) && !NONE_KEYWORD.test(name) && !CLAUSE_KEYWORD.test(name);

export const isWritableAssetReference = (kind: AssetReferenceKind, reference: string): boolean => {
  const [name = "", ...attributes] = reference.split(":");
  if (!isWritableAssetName(name)) return false;
  if (kind === "sound" || kind === "music") return attributes.length === 0;
  return attributes.every((attribute) => ATTRIBUTE.test(attribute));
};

const COMMANDS: Record<AssetReferenceKind, (reference: string) => string> = {
  backdrop: (reference) => `[[show backdrop ${reference}]]`,
  portrait: (reference) => `[[show portrait ${reference}]]`,
  sound: (reference) => `((play sound ${reference}))`,
  music: (reference) => `((play music ${reference} loop))`,
};

export const assetCommandOf = (kind: AssetReferenceKind, reference: string): string | null =>
  isWritableAssetReference(kind, reference) ? COMMANDS[kind](reference) : null;
