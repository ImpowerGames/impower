import {
  comboLabel,
  comboParts,
  type ShortcutPlatform,
} from "@impower/codemirror-vscode-lsp-client/src/shortcutCombo";
import {
  activeCombos,
  assignShortcut,
  fixedHolder,
  resolveShortcuts,
  restoreShortcut,
  shortcutForEvent,
  usualCombo,
  type ShortcutChange,
  type ShortcutCombos,
} from "@impower/codemirror-vscode-lsp-client/src/shortcutRules";
import { editorShortcutDispatch } from "@impower/codemirror-vscode-lsp-client/src/shortcutDispatch";
import type { ShortcutRow } from "@impower/codemirror-vscode-lsp-client/src/shortcutTable";
import { batch, computed, type ReadonlySignal } from "@preact/signals";
import workspaceSettings, {
  type WorkspaceSettings,
} from "../settings/WorkspaceSettings";
import { STEP_SHORTCUTS } from "../stepStates";
import workspace from "../WorkspaceStore";
import {
  SHORTCUT_PLATFORM,
  SHORTCUT_PREFERENCE_KEYS,
  SHORTCUT_PREFERENCES,
  SHORTCUT_ROWS,
  shortcutPreferenceKey,
  type ShortcutId,
} from "./shortcutTable";

type KeyEventLike = Parameters<typeof shortcutForEvent>[0];

const STEP_SHORTCUT_IDS: ReadonlySet<string> = new Set(
  Object.values(STEP_SHORTCUTS),
);

export class WorkspaceShortcuts {
  readonly combos: ReadonlySignal<ShortcutCombos>;

  readonly editorCombos: ReadonlySignal<ShortcutCombos>;

  constructor(
    protected readonly settings: WorkspaceSettings,
    readonly platform: ShortcutPlatform = SHORTCUT_PLATFORM,
    protected readonly rows: readonly ShortcutRow[] = SHORTCUT_ROWS,
  ) {
    let previous: ShortcutCombos | undefined;
    this.combos = computed(() => {
      const preferences = settings.preferences.value as Readonly<
        Record<string, unknown>
      >;
      const overrides: Record<string, unknown> = {};
      for (const row of rows) {
        const key = shortcutPreferenceKey(row.id);
        if (preferences[key] !== SHORTCUT_PREFERENCES[key]?.default) {
          overrides[row.id] = preferences[key];
        }
      }
      const next = resolveShortcuts(rows, overrides, platform);
      if (!previous || rows.some((row) => previous![row.id] !== next[row.id])) {
        previous = next;
      }
      return previous;
    });
    const running = computed(
      () => !!workspace.state.value.preview?.modes?.game?.running,
    );
    this.editorCombos = computed(() => {
      const combos = this.combos.value;
      return running.value
        ? combos
        : Object.fromEntries(
            Object.entries(combos).filter(
              ([id]) => !STEP_SHORTCUT_IDS.has(id),
            ),
          );
    });
  }

  row(id: ShortcutId): ShortcutRow | undefined {
    return this.rows.find((row) => row.id === id);
  }

  usual(id: ShortcutId): string {
    const row = this.row(id);
    return row ? usualCombo(row, this.platform) : "";
  }

  combo(id: ShortcutId): string {
    return this.combos.value[id] ?? "";
  }

  changed(id: ShortcutId): boolean {
    return this.combo(id) !== this.usual(id);
  }

  label(combo: string): string {
    return comboLabel(combo, this.platform);
  }

  parts(combo: string): string[] {
    return comboParts(combo, this.platform);
  }

  active(id: ShortcutId): string[] {
    const row = this.row(id);
    return row ? activeCombos(row, this.combos.value, this.platform) : [];
  }

  title(id: ShortcutId, name: string): string {
    const combo = this.active(id)[0];
    return combo ? `${name} (${this.label(combo)})` : name;
  }

  matches(event: KeyEventLike, id: ShortcutId): boolean {
    const winner =
      editorShortcutDispatch(event)?.handled ??
      shortcutForEvent(event, this.rows, this.combos.peek(), this.platform);
    return winner === id;
  }

  record(id: ShortcutId, combo: string): ShortcutChange {
    const current = this.combos.peek();
    const refused = combo && combo !== this.usual(id) ? fixedHolder(combo, this.platform) : undefined;
    if (refused) {
      return { combos: current, refused };
    }
    return this.commit(assignShortcut(current, id, combo, this.platform));
  }

  clear(id: ShortcutId): ShortcutChange {
    return this.record(id, "");
  }

  restore(id: ShortcutId): ShortcutChange {
    return this.commit(
      restoreShortcut(this.rows, this.combos.peek(), id, this.platform),
    );
  }

  resetAll(): void {
    this.settings.resetPreferences(SHORTCUT_PREFERENCE_KEYS);
  }

  protected commit(change: ShortcutChange): ShortcutChange {
    const current = this.combos.peek();
    batch(() => {
      for (const row of this.rows) {
        const next = change.combos[row.id] ?? "";
        if (next === current[row.id]) {
          continue;
        }
        const key = shortcutPreferenceKey(row.id);
        if (next === usualCombo(row, this.platform)) {
          this.settings.resetPreferences([key]);
        } else {
          this.settings.setPreference(key, next);
        }
      }
    });
    return change;
  }
}

const workspaceShortcuts = new WorkspaceShortcuts(workspaceSettings);

export default workspaceShortcuts;
