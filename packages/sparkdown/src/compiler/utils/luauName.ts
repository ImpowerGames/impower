import { RESERVED } from "./luauReservedWords";

export const LUAU_NAME_SOURCE = "[A-Za-z_][A-Za-z0-9_]*(?:@[A-Za-z0-9_]+)*";

export const LUAU_NAME_TOKEN_SOURCE = `(?!(?:${[...RESERVED].join("|")})@)${LUAU_NAME_SOURCE}|[A-Za-z_][A-Za-z0-9_]*`;

const LUAU_NAME_AT_START = new RegExp(`^${LUAU_NAME_SOURCE}`);

export const luauNameAtStart = (text: string): string | undefined => {
  const name = LUAU_NAME_AT_START.exec(text)?.[0];
  if (name === undefined) return undefined;
  const at = name.indexOf("@");
  return at > 0 && RESERVED.has(name.slice(0, at)) ? name.slice(0, at) : name;
};

export const isLuauName = (text: string): boolean => luauNameAtStart(text) === text;
