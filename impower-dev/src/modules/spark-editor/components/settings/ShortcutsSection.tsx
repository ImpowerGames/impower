import {
  comboFromEvent,
  isShortcutCombo,
} from "@impower/codemirror-vscode-lsp-client/src/shortcutCombo";
import type { ShortcutRow } from "@impower/codemirror-vscode-lsp-client/src/shortcutTable";
import {
  announce,
  KeysChip,
  SettingsGroup,
  SettingsList,
  SettingsRow,
  SettingsSection,
} from "@impower/impower-ui/components";
import { useRef, useState } from "preact/hooks";
import {
  SHORTCUT_PREFERENCE_KEYS,
  SHORTCUT_SECTIONS,
  type ShortcutId,
} from "../../workspace/shortcuts/shortcutTable";
import workspaceShortcuts from "../../workspace/shortcuts/WorkspaceShortcuts";
import type { SettingsSectionInfo } from "./sections";
import { useSectionReset } from "./useSectionReset";

const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "Meta", "AltGraph", "OS"]);

const SETTLE_MS = 400;

const shortcuts = workspaceShortcuts;

const nameOf = (id: string) => shortcuts.row(id as ShortcutId)?.name ?? id;

const spoken = (combo: string) => (combo ? shortcuts.label(combo) : "");

const refusedNote = () =>
  shortcuts.platform === "mac"
    ? "Hold Command, Control or Option with the key, or use a function key."
    : "Hold Ctrl or Alt with the key, or use a function key.";

const recordingPrompt = (name: string) =>
  `Press the keys for ${name}. Backspace takes the shortcut away; Esc keeps it.`;

const chipLabel = (name: string, combo: string) =>
  `${name} shortcut: ${combo ? spoken(combo) : "none"}. Press to change.`;

function ShortcutKeysRow({
  row,
  recording,
  onRecord,
  onStop,
  justStopped,
}: {
  row: ShortcutRow;
  recording: boolean;
  onRecord: () => void;
  onStop: () => void;
  justStopped: () => boolean;
}) {
  const id = row.id as ShortcutId;
  const combo = shortcuts.combos.value[id] ?? "";
  const changed = combo !== shortcuts.usual(id);

  const restore = () => {
    const usual = shortcuts.usual(id);
    const { displaced } = shortcuts.restore(id);
    const again = usual ? `${row.name}: ${spoken(usual)} again.` : `${row.name} has no shortcut again.`;
    announce(displaced ? `${again} ${nameOf(displaced)} has no shortcut now.` : again);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (!recording) {
      return;
    }
    if (event.key === "Tab") {
      onStop();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      onStop();
      announce(`${row.name} keeps ${combo ? spoken(combo) : "no shortcut"}.`);
      return;
    }
    const bare = !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
    if ((event.key === "Backspace" || event.key === "Delete") && bare) {
      shortcuts.clear(id);
      onStop();
      announce(`${row.name} has no shortcut now.`);
      return;
    }
    if (MODIFIER_KEYS.has(event.key)) {
      return;
    }
    const next = comboFromEvent(event, shortcuts.platform);
    if (!isShortcutCombo(next)) {
      announce(refusedNote());
      return;
    }
    const { displaced } = shortcuts.record(id, next);
    onStop();
    announce(
      displaced
        ? `${row.name}: ${spoken(next)}. It was ${nameOf(displaced)}'s, which has no shortcut now.`
        : `${row.name}: ${spoken(next)}.`,
    );
  };

  return (
    <SettingsRow
      id={`shortcut-${id}`}
      name={row.name}
      detail={row.detail}
      setting={id}
      changed={changed}
      onReset={restore}
      control={
        <KeysChip
          id={`shortcut-${id}-control`}
          data-shortcut={id}
          keys={shortcuts.parts(combo)}
          recording={recording}
          aria-label={recording ? recordingPrompt(row.name) : chipLabel(row.name, combo)}
          onClick={() => {
            if (recording || justStopped()) {
              return;
            }
            onRecord();
            announce(recordingPrompt(row.name));
          }}
          onBlur={() => {
            if (recording) {
              onStop();
            }
          }}
          onKeyDown={onKeyDown}
        />
      }
    />
  );
}

export default function ShortcutsSection({ section }: { section: SettingsSectionInfo }) {
  const reset = useSectionReset({ preferences: SHORTCUT_PREFERENCE_KEYS });
  const [recording, setRecording] = useState<string | null>(null);
  const settled = useRef<{ id: string; at: number } | null>(null);
  return (
    <SettingsSection
      id={section.id}
      title={section.title}
      detail={section.detail}
      {...reset}
    >
      {SHORTCUT_SECTIONS.map((group) => (
        <SettingsGroup key={group.id} legend={group.legend}>
          <SettingsList>
            {group.rows.map((row) => (
              <ShortcutKeysRow
                key={row.id}
                row={row}
                recording={recording === row.id}
                onRecord={() => setRecording(row.id)}
                onStop={() => {
                  settled.current = { id: row.id, at: performance.now() };
                  setRecording((current) => (current === row.id ? null : current));
                }}
                justStopped={() =>
                  settled.current?.id === row.id &&
                  performance.now() - settled.current.at < SETTLE_MS
                }
              />
            ))}
          </SettingsList>
        </SettingsGroup>
      ))}
    </SettingsSection>
  );
}
