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

export function isShortcutCombo(combo: unknown): boolean {
  const parsed = parseCombo(combo);
  return (
    !!parsed &&
    isRecordableKey(parsed.key) &&
    (parsed.mod || parsed.ctrl || parsed.alt || isFunctionKey(parsed.key))
  );
}

interface ShortcutKeyEvent {
  readonly code?: string;
  readonly key?: string;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly shiftKey?: boolean;
  readonly altKey?: boolean;
  readonly isComposing?: boolean;
}

export function keyOfEvent(event: ShortcutKeyEvent): string {
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
}

const eventModifiers = (
  event: ShortcutKeyEvent,
  platform: ShortcutPlatform,
) =>
  platform === "mac"
    ? { mod: !!event.metaKey, ctrl: !!event.ctrlKey }
    : { mod: !!event.ctrlKey, ctrl: false };

export function comboFromEvent(
  event: ShortcutKeyEvent,
  platform: ShortcutPlatform,
): string {
  const key = keyOfEvent(event);
  if (!key || (platform !== "mac" && event.metaKey)) {
    return "";
  }
  return formatCombo({
    ...eventModifiers(event, platform),
    shift: !!event.shiftKey,
    alt: !!event.altKey,
    key,
  });
}

export function eventMatchesCombo(
  event: ShortcutKeyEvent,
  combo: string,
  platform: ShortcutPlatform,
): boolean {
  const parsed = parseCombo(combo);
  if (!parsed || event.isComposing || (platform !== "mac" && event.metaKey)) {
    return false;
  }
  const wanted = forPlatform(parsed, platform);
  const held = eventModifiers(event, platform);
  return (
    keyOfEvent(event) === wanted.key &&
    held.mod === wanted.mod &&
    held.ctrl === wanted.ctrl &&
    !!event.shiftKey === wanted.shift &&
    !!event.altKey === wanted.alt
  );
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
