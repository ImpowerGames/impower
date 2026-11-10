import SPARKDOWN_LUAU_CONFIG from "../../../language/sparkdown-luau.language-config.json";
import SPARKDOWN_CONFIG from "../../../language/sparkdown.language-config.json";
import SPARKDOWN_LUAU_SNIPPETS from "../../../language/sparkdown-luau.language-snippets.json";
import SPARKDOWN_SNIPPETS from "../../../language/sparkdown.language-snippets.json";
import { isLuauFile } from "../typecheck/LuauUnitNodes";

export const SPARKDOWN_LANGUAGE = "sparkdown";

export const SPARKDOWN_LUAU_LANGUAGE = "sparkdown-luau";

export const SPARKDOWN_LANGUAGE_CONFIGS = {
  [SPARKDOWN_LANGUAGE]: SPARKDOWN_CONFIG,
  [SPARKDOWN_LUAU_LANGUAGE]: SPARKDOWN_LUAU_CONFIG,
};

export const SPARKDOWN_LANGUAGE_SNIPPETS: Readonly<
  Record<string, Readonly<Record<string, unknown>>>
> = {
  [SPARKDOWN_LANGUAGE]: SPARKDOWN_SNIPPETS,
  [SPARKDOWN_LUAU_LANGUAGE]: SPARKDOWN_LUAU_SNIPPETS,
};

export const SPARKDOWN_EMBEDDED_LANGUAGES: Readonly<Record<string, string>> = {
  "meta.embedded.block.luau": SPARKDOWN_LUAU_LANGUAGE,
  "meta.embedded.line.luau": SPARKDOWN_LUAU_LANGUAGE,
};

export function sparkdownLanguageFor(uri: string | undefined): string {
  return uri !== undefined && isLuauFile(uri)
    ? SPARKDOWN_LUAU_LANGUAGE
    : SPARKDOWN_LANGUAGE;
}
