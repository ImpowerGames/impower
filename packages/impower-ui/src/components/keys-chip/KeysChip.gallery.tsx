import { useState } from "preact/hooks";
import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import KeysChip, { type KeysChipState } from "./KeysChip";

const STATES: Record<KeysChipState, { label: string; keys: readonly string[] }> = {
  keys: { label: "Keys, one kbd per part", keys: ["Ctrl", "Shift", "Z"] },
  none: { label: "No keys", keys: [] },
  recording: { label: "Recording", keys: ["Ctrl", "F"] },
};

const THEMES = ["charcoal", "chalk"] as const;

function KeysChipDemo() {
  const [recording, setRecording] = useState(false);
  return (
    <div class="grid gap-4 lg:grid-cols-2">
      {THEMES.map((theme) => (
        <div key={theme} data-theme={theme} class="space-y-3 rounded-card bg-panel p-4 text-ink">
          {(Object.keys(STATES) as KeysChipState[]).map((state) => (
            <GalleryRow key={state} label={`${STATES[state].label}, ${theme}`}>
              <KeysChip
                keys={STATES[state].keys}
                recording={state === "recording"}
                aria-label={STATES[state].label}
              />
            </GalleryRow>
          ))}
          <GalleryRow label={`Press to record, ${theme}`}>
            <KeysChip
              keys={["⌘", "⇧", "["]}
              recording={recording}
              aria-label="Fold a block shortcut"
              onClick={() => setRecording(true)}
              onBlur={() => setRecording(false)}
              onKeyDown={(event) => {
                if (recording) {
                  event.preventDefault();
                  setRecording(false);
                }
              }}
            />
          </GalleryRow>
        </div>
      ))}
    </div>
  );
}

export const keysChipGallery: GalleryEntry = {
  title: "KeysChip",
  exports: ["KeysChip", "keysChipVariants"],
  Demo: KeysChipDemo,
};
