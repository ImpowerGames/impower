import {
  eventMatchesCombo,
  isShortcutCombo,
  normalizeCombo,
  type ShortcutPlatform,
} from "./shortcutCombo";
import { platformKeys, type ShortcutRow } from "./shortcutTable";

export type ShortcutCombos = Readonly<Record<string, string>>;

export const usualCombo = (row: ShortcutRow, platform: ShortcutPlatform) =>
  normalizeCombo(platformKeys(row.keys, platform), platform);

export const aliasCombos = (row: ShortcutRow, platform: ShortcutPlatform) =>
  (row.aliases ?? [])
    .map((alias) => normalizeCombo(platformKeys(alias, platform), platform))
    .filter(Boolean);

export function resolveShortcuts(
  rows: readonly ShortcutRow[],
  overrides: Readonly<Record<string, unknown>>,
  platform: ShortcutPlatform,
): ShortcutCombos {
  const combos: Record<string, string> = {};
  const held = new Set<string>();
  for (const row of rows) {
    const saved = Object.hasOwn(overrides, row.id) ? overrides[row.id] : undefined;
    const combo =
      saved === ""
        ? ""
        : isShortcutCombo(saved)
          ? normalizeCombo(saved, platform)
          : usualCombo(row, platform);
    if (combo && held.has(combo)) {
      combos[row.id] = "";
    } else {
      combos[row.id] = combo;
      if (combo) {
        held.add(combo);
      }
    }
  }
  return combos;
}

export const shortcutHolder = (
  combos: ShortcutCombos,
  combo: string,
): string | undefined =>
  combo
    ? Object.keys(combos).find((id) => combos[id] === combo)
    : undefined;

export function activeCombos(
  row: ShortcutRow,
  combos: ShortcutCombos,
  platform: ShortcutPlatform,
): string[] {
  const own = combos[row.id] ?? "";
  const live = aliasCombos(row, platform).filter(
    (alias) => alias !== own && !shortcutHolder(combos, alias),
  );
  return [...new Set([own, ...live].filter(Boolean))];
}

export interface ShortcutChange {
  readonly combos: ShortcutCombos;
  readonly displaced?: string;
}

export function assignShortcut(
  combos: ShortcutCombos,
  id: string,
  combo: string,
  platform: ShortcutPlatform,
): ShortcutChange {
  const normalized = combo ? normalizeCombo(combo, platform) : "";
  const holder = shortcutHolder(combos, normalized);
  const displaced = holder && holder !== id ? holder : undefined;
  return {
    combos: {
      ...combos,
      ...(displaced ? { [displaced]: "" } : {}),
      [id]: normalized,
    },
    displaced,
  };
}

export function restoreShortcut(
  rows: readonly ShortcutRow[],
  combos: ShortcutCombos,
  id: string,
  platform: ShortcutPlatform,
): ShortcutChange {
  const row = rows.find((candidate) => candidate.id === id);
  return row
    ? assignShortcut(combos, id, usualCombo(row, platform), platform)
    : { combos };
}

export function shortcutMatches(
  event: Parameters<typeof eventMatchesCombo>[0],
  row: ShortcutRow,
  combos: ShortcutCombos,
  platform: ShortcutPlatform,
): boolean {
  return activeCombos(row, combos, platform).some((combo) =>
    eventMatchesCombo(event, combo, platform),
  );
}
