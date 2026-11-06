import { base as keyCodeBase, shift as keyCodeShift } from "w3c-keyname";

export type ShortcutPlatform = "mac" | "win" | "linux";

export const shortcutPlatform = (): ShortcutPlatform => {
  const platform =
    typeof navigator === "undefined" ? "" : navigator.platform || "";
  if (/Mac|iPhone|iPad|iPod/.test(platform)) {
    return "mac";
  }
  if (/Win/.test(platform)) {
    return "win";
  }
  return "linux";
};

export const KEYS_BY_CODE: Readonly<Record<string, string>> = {
  Space: "Space",
  BracketLeft: "[",
  BracketRight: "]",
  Minus: "-",
  Equal: "=",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Backquote: "`",
  Enter: "Enter",
  NumpadEnter: "Enter",
  Backspace: "Backspace",
  Delete: "Delete",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Insert: "Insert",
};

const RECORDABLE_KEYS = new Set(Object.values(KEYS_BY_CODE));

const FIXED_KEYS = new Set(["Tab", "Escape"]);

const CODEMIRROR_KEYS: Readonly<Record<string, string>> = {
  Up: "ArrowUp",
  Down: "ArrowDown",
  Left: "ArrowLeft",
  Right: "ArrowRight",
};

export interface ShortcutCombo {
  readonly mod: boolean;
  readonly ctrl: boolean;
  readonly shift: boolean;
  readonly alt: boolean;
  readonly key: string;
}

export const isFunctionKey = (key: string) => /^F([1-9]|1[0-2])$/.test(key);

const isRecordableKey = (key: string) =>
  /^[A-Z]$/.test(key) ||
  /^\d$/.test(key) ||
  isFunctionKey(key) ||
  RECORDABLE_KEYS.has(key);

const MODIFIERS = ["Mod", "Ctrl", "Shift", "Alt"] as const;

export function parseCombo(combo: unknown): ShortcutCombo | null {
  if (typeof combo !== "string" || !combo) {
    return null;
  }
  const parts = combo.split("+");
  const key = parts.pop();
  if (!key || (!isRecordableKey(key) && !FIXED_KEYS.has(key))) {
    return null;
  }
  if (
    !parts.every((part) => (MODIFIERS as readonly string[]).includes(part)) ||
    new Set(parts).size !== parts.length
  ) {
    return null;
  }
  return {
    mod: parts.includes("Mod"),
    ctrl: parts.includes("Ctrl"),
    shift: parts.includes("Shift"),
    alt: parts.includes("Alt"),
    key,
  };
}

const formatCombo = (combo: ShortcutCombo) =>
  [
    combo.mod && "Mod",
    combo.ctrl && "Ctrl",
    combo.shift && "Shift",
    combo.alt && "Alt",
    combo.key,
  ]
    .filter(Boolean)
    .join("+");

const forPlatform = (
  combo: ShortcutCombo,
  platform: ShortcutPlatform,
): ShortcutCombo =>
  platform !== "mac" && combo.ctrl ? { ...combo, mod: true, ctrl: false } : combo;

export function normalizeCombo(
  combo: unknown,
  platform: ShortcutPlatform,
): string {
  const parsed = parseCombo(combo);
  return parsed ? formatCombo(forPlatform(parsed, platform)) : "";
}

const PUNCTUATION = new Set(
  [...RECORDABLE_KEYS].filter((key) => key.length === 1),
);

const typesCharacter = (key: string) =>
  /^[A-Z]$/.test(key) || /^\d$/.test(key) || key === "Space" || PUNCTUATION.has(key);

export function typesOnMac(combo: unknown): boolean {
  const parsed = parseCombo(combo);
  return (
    !!parsed && parsed.alt && !parsed.mod && !parsed.ctrl && typesCharacter(parsed.key)
  );
}

export function isShortcutCombo(
  combo: unknown,
  platform?: ShortcutPlatform,
): boolean {
  const parsed = parseCombo(combo);
  return (
    !!parsed &&
    isRecordableKey(parsed.key) &&
    (parsed.mod || parsed.ctrl || parsed.alt || isFunctionKey(parsed.key)) &&
    !(platform === "mac" && typesOnMac(combo))
  );
}

export interface ShortcutKeyEvent {
  readonly code?: string;
  readonly key?: string;
  readonly keyCode?: number;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly shiftKey?: boolean;
  readonly altKey?: boolean;
  readonly isComposing?: boolean;
}

const LEGACY_NAMES: Readonly<Record<string, string>> = {
  Esc: "Escape",
  Del: "Delete",
  Left: "ArrowLeft",
  Up: "ArrowUp",
  Right: "ArrowRight",
  Down: "ArrowDown",
};

const NAMED_KEYS_BY_CODEMIRROR_NAME: Readonly<Record<string, string>> = {
  " ": "Space",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
};

const withModifiers = (
  name: string,
  event: ShortcutKeyEvent,
  shift: boolean,
) => {
  let result = name;
  if (event.altKey) result = `Alt-${result}`;
  if (event.ctrlKey) result = `Ctrl-${result}`;
  if (event.metaKey) result = `Meta-${result}`;
  if (shift && event.shiftKey) result = `Shift-${result}`;
  return result;
};

function codeMirrorNames(
  event: ShortcutKeyEvent,
  platform: ShortcutPlatform,
): string[] {
  const keyCode = event.keyCode ?? 0;
  const ignoreKey =
    (platform === "mac" &&
      event.metaKey &&
      event.shiftKey &&
      !event.ctrlKey &&
      !event.altKey) ||
    event.key === "Unidentified";
  const found =
    (!ignoreKey && event.key) ||
    (event.shiftKey ? keyCodeShift : keyCodeBase)[keyCode] ||
    event.key ||
    "Unidentified";
  const name = LEGACY_NAMES[found] ?? found;
  const isChar = [...name].length === 1 && name !== " ";
  const names = [withModifiers(name, event, !isChar)];
  const baseName = keyCodeBase[keyCode];
  if (
    isChar &&
    (event.altKey || event.metaKey || event.ctrlKey) &&
    !(platform === "win" && event.ctrlKey && event.altKey) &&
    !(platform === "mac" && event.altKey && !(event.ctrlKey || event.metaKey)) &&
    baseName &&
    baseName !== name
  ) {
    names.push(withModifiers(baseName, event, true));
    const shiftName = keyCodeShift[keyCode];
    if (event.shiftKey && shiftName && shiftName !== name && shiftName !== baseName) {
      names.push(withModifiers(shiftName, event, false));
    }
  } else if (isChar && event.shiftKey) {
    names.push(withModifiers(name, event, true));
  }
  return names;
}

function comboOfCodeMirrorName(
  name: string,
  platform: ShortcutPlatform,
): string {
  const parts = name.split(/-(?!$)/);
  const last = parts.pop() ?? "";
  const key = /^[a-z]$/.test(last)
    ? last.toUpperCase()
    : /^\d$/.test(last) || isFunctionKey(last) || PUNCTUATION.has(last)
      ? last
      : (NAMED_KEYS_BY_CODEMIRROR_NAME[last] ??
        (RECORDABLE_KEYS.has(last) && !PUNCTUATION.has(last) ? last : ""));
  if (!key) {
    return "";
  }
  const combo = { mod: false, ctrl: false, shift: false, alt: false, key };
  for (const part of parts) {
    if (part === "Alt") combo.alt = true;
    else if (part === "Shift") combo.shift = true;
    else if (part === "Meta" && platform === "mac") combo.mod = true;
    else if (part === "Ctrl" && platform === "mac") combo.ctrl = true;
    else if (part === "Ctrl") combo.mod = true;
    else return "";
  }
  return formatCombo(combo);
}

const syntheticKey = (event: ShortcutKeyEvent) => {
  const code = event.code || "";
  const key = event.key || "";
  if (/^[a-z]$/i.test(key)) {
    return key.toUpperCase();
  }
  if (/^Key[A-Z]$/.test(code)) {
    return code.slice(3);
  }
  if (/^Digit\d$/.test(code)) {
    return code.slice(5);
  }
  if (isFunctionKey(code)) {
    return code;
  }
  if (KEYS_BY_CODE[code]) {
    return KEYS_BY_CODE[code]!;
  }
  if (code) {
    return "";
  }
  if (/^\d$/.test(key) || isFunctionKey(key)) {
    return key;
  }
  if (key === " ") {
    return "Space";
  }
  return KEYS_BY_CODE[key] ?? "";
};

const syntheticCombo = (
  event: ShortcutKeyEvent,
  platform: ShortcutPlatform,
) => {
  const key = syntheticKey(event);
  return key
    ? formatCombo({
        mod: !!(platform === "mac" ? event.metaKey : event.ctrlKey),
        ctrl: platform === "mac" && !!event.ctrlKey,
        shift: !!event.shiftKey,
        alt: !!event.altKey,
        key,
      })
    : "";
};

export function eventCombos(
  event: ShortcutKeyEvent,
  platform: ShortcutPlatform,
): string[] {
  if (event.isComposing || (platform !== "mac" && event.metaKey)) {
    return [];
  }
  if (!event.keyCode) {
    return [syntheticCombo(event, platform)].filter(Boolean);
  }
  return codeMirrorNames(event, platform)
    .map((name) => comboOfCodeMirrorName(name, platform))
    .filter(Boolean);
}

export function comboFromEvent(
  event: ShortcutKeyEvent,
  platform: ShortcutPlatform,
): string {
  return eventCombos(event, platform)[0] ?? "";
}

export function codeMirrorKey(
  combo: string,
  platform: ShortcutPlatform,
): string {
  const parsed = parseCombo(combo);
  if (!parsed) {
    return "";
  }
  const { mod, ctrl, shift, alt, key } = forPlatform(parsed, platform);
  return [
    shift && "Shift",
    mod && (platform === "mac" ? "Meta" : "Ctrl"),
    ctrl && "Ctrl",
    alt && "Alt",
    /^[A-Z]$/.test(key) ? key.toLowerCase() : (CODEMIRROR_KEYS[key] ?? key),
  ]
    .filter(Boolean)
    .join("-");
}

const MAC_MODIFIERS: Readonly<Record<string, string>> = {
  Mod: "⌘",
  Ctrl: "⌃",
  Shift: "⇧",
  Alt: "⌥",
};

const KEY_LABELS: Readonly<Record<string, string>> = {
  Escape: "Esc",
};

export function comboParts(
  combo: string,
  platform: ShortcutPlatform,
): string[] {
  const normalized = normalizeCombo(combo, platform);
  if (!normalized) {
    return [];
  }
  return normalized.split("+").map((part) => {
    if (platform === "mac" && MAC_MODIFIERS[part]) {
      return MAC_MODIFIERS[part]!;
    }
    if (part === "Mod") {
      return "Ctrl";
    }
    return KEY_LABELS[part] ?? part;
  });
}

export function comboLabel(combo: string, platform: ShortcutPlatform): string {
  return comboParts(combo, platform).join(platform === "mac" ? "" : "+");
}
