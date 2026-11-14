export const CHARACTER_ALIAS_ID = "character.?.aliases=";

export const characterAliasOwners = (
  context: Record<string, any> | undefined,
  alias: string,
): string[] =>
  Object.entries<{ aliases?: unknown }>(context?.["character"] ?? {})
    .filter(
      ([name, character]) =>
        !name.startsWith("$") &&
        Array.isArray(character?.aliases) &&
        character.aliases.includes(alias),
    )
    .map(([name]) => name);
