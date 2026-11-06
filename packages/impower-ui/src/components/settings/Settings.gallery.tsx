import { useState } from "preact/hooks";
import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import Button from "../button/Button";
import { DownloadIcon } from "../icon/icons.generated";
import KeysChip from "../keys-chip/KeysChip";
import {
  ChoiceRow,
  SelectRow,
  SettingsFoot,
  SettingsGroup,
  SettingsList,
  SettingsPlaceholder,
  SettingsRow,
  SettingsSection,
  SwitchRow,
  TextRow,
  type SettingsRowIndent,
} from "./Settings";

const THEMES = ["charcoal", "chalk"] as const;

const INDENTS: Record<SettingsRowIndent, string> = {
  none: "Row",
  sub: "Sub row",
};

const DEFAULTS = {
  titlePage: true,
  sceneNumbers: "none",
  more: "(MORE)",
  page: "paper",
  bookmarks: true,
  hidden: true,
};

function RowKit({ theme }: { theme: (typeof THEMES)[number] }) {
  const [values, setValues] = useState({ ...DEFAULTS, titlePage: false });
  const [undoKeys, setUndoKeys] = useState<readonly string[]>(["Ctrl", "U"]);
  const set = <K extends keyof typeof DEFAULTS>(key: K, value: (typeof DEFAULTS)[K]) =>
    setValues((current) => ({ ...current, [key]: value }));
  const changed = (Object.keys(DEFAULTS) as (keyof typeof DEFAULTS)[]).some(
    (key) => values[key] !== DEFAULTS[key],
  );
  return (
    <div data-theme={theme} class="@container/page space-y-11 rounded-card bg-bg p-6 text-ink">
      <SettingsSection
        id={`${theme}-screenplay`}
        title="Screenplay"
        detail="How the story prints as a screenplay."
        changed={changed}
        onReset={() => setValues({ ...DEFAULTS })}
        actions={
          <Button variant="quiet">
            <DownloadIcon /> Export
          </Button>
        }
      >
        <SettingsGroup legend="Pages" note="What the printed pages hold.">
          <SettingsList>
            <SwitchRow
              id={`${theme}-title-page`}
              name="Title page"
              setting="titlePage"
              detail={{ on: "The first page shows the title.", off: "The script starts on the first page." }}
              checked={values.titlePage}
              onCheckedChange={(next) => set("titlePage", next)}
            />
            <SelectRow
              id={`${theme}-scene-numbers`}
              name="Scene numbers"
              setting="sceneNumbers"
              detail="Where each scene's number prints."
              options={[
                { value: "none", label: "None" },
                { value: "left", label: "Left" },
                { value: "right", label: "Right" },
                { value: "both", label: "Both sides" },
              ]}
              value={values.sceneNumbers}
              onValueChange={(next) => set("sceneNumbers", next)}
            />
            <TextRow
              id={`${theme}-more`}
              name="MORE"
              setting="more"
              detail="Printed under dialogue that continues on the next page."
              width="short"
              font="mono"
              value={values.more}
              onValueChange={(next) => set("more", next)}
            />
            <ChoiceRow
              id={`${theme}-page`}
              name="Page"
              group={`${theme}-page`}
              setting="page"
              options={[
                { value: "paper", label: "Paper", detail: "The script sits on a sheet of paper." },
                { value: "plain", label: "Plain", detail: "The script sits on the editor's own surface." },
              ]}
              value={values.page}
              onValueChange={(next) => set("page", next)}
            />
          </SettingsList>
        </SettingsGroup>
        <SettingsGroup legend="Bookmarks">
          <SettingsList>
            {(Object.keys(INDENTS) as SettingsRowIndent[]).map((indent) => (
              <SwitchRow
                key={indent}
                id={`${theme}-bookmarks-${indent}`}
                name={indent === "none" ? "Bookmarks" : "Hidden headings"}
                detail={`${INDENTS[indent]}: indent ${indent}`}
                indent={indent}
                checked={indent === "none" ? values.bookmarks : values.hidden}
                disabled={indent === "sub" && !values.bookmarks}
                onCheckedChange={(next) => set(indent === "none" ? "bookmarks" : "hidden", next)}
              />
            ))}
            <SwitchRow
              id={`${theme}-rich-detail`}
              name="Emphasize markup"
              detail={
                <>
                  Show <i>italic</i> and <b>bold</b> as the reader sees them.
                </>
              }
              checked={values.bookmarks}
              onCheckedChange={(next) => set("bookmarks", next)}
            />
            <SettingsRow id={`${theme}-plain`} name="A row with only copy" detail="Its control is a button." control={<Button>Open</Button>} />
            <SettingsRow
              id={`${theme}-undo`}
              name="Undo"
              detail="A row with its own Reset, shown while it differs from its usual value."
              setting="undo"
              changed={undoKeys.join() !== "Ctrl,Z"}
              onReset={() => setUndoKeys(["Ctrl", "Z"])}
              control={<KeysChip keys={undoKeys} aria-label="Undo shortcut" onClick={() => setUndoKeys(["Ctrl", "U"])} />}
            />
          </SettingsList>
        </SettingsGroup>
        <SettingsFoot>
          <Button variant="quiet">Download settings.json</Button>
        </SettingsFoot>
      </SettingsSection>
      <SettingsPlaceholder id={`${theme}-file-types`} title="File types" detail="Which files the project reads as scripts, images and sounds." />
    </div>
  );
}

function SettingsDemo() {
  return (
    <GalleryRow label="Every row kind, a group, a foot, a reset and a placeholder, in Charcoal and in Chalk">
      <div class="grid gap-6 lg:grid-cols-2">
        {THEMES.map((theme) => (
          <RowKit key={theme} theme={theme} />
        ))}
      </div>
    </GalleryRow>
  );
}

export const settingsGallery: GalleryEntry = {
  title: "Settings",
  exports: [
    "SettingsSection",
    "SettingsGroup",
    "SettingsList",
    "SettingsRow",
    "SwitchRow",
    "SelectRow",
    "TextRow",
    "ChoiceRow",
    "SettingsFoot",
    "SettingsPlaceholder",
    "settingsRowVariants",
  ],
  Demo: SettingsDemo,
};
