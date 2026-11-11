export const LUAU_NAME_SOURCE = "[A-Za-z_][A-Za-z0-9_]*(?:@[A-Za-z0-9_]+)*";

export const LUAU_NAME_AT_START = new RegExp(`^${LUAU_NAME_SOURCE}`);

const LUAU_NAME_WHOLE = new RegExp(`^${LUAU_NAME_SOURCE}$`);

export const isLuauName = (text: string): boolean => LUAU_NAME_WHOLE.test(text);

export const LUAU_TYPE_DOT_NAME = new RegExp(String.raw`^(${LUAU_NAME_SOURCE})\.(${LUAU_NAME_SOURCE})$`);
