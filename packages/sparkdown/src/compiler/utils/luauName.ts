export const LUAU_NAME_SOURCE = "[A-Za-z_][A-Za-z0-9_]*(?:@[A-Za-z0-9_]+)*";

const LUAU_NAME_AT_START = new RegExp(`^${LUAU_NAME_SOURCE}`);

const LUAU_NAME_WHOLE = new RegExp(`^${LUAU_NAME_SOURCE}$`);

export const luauNameAtStart = (text: string): string | undefined => LUAU_NAME_AT_START.exec(text)?.[0];

export const isLuauName = (text: string): boolean => LUAU_NAME_WHOLE.test(text);
