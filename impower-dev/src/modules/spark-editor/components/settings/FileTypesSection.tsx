import { SettingsList, SettingsSection, TextRow } from "@impower/impower-ui/components";
import { useState } from "preact/hooks";
import { endingsText, typedPattern } from "../../workspace/settings/fileEndings";
import { PROJECT_SETTINGS_SCHEMA } from "../../workspace/settings/settingsSchema";
import { useSettings } from "../../workspace/settings/useSettings";
import type { SettingsSectionInfo } from "./sections";
import { useSectionReset } from "./useSectionReset";

const FILE_TYPES = [
  { key: "scriptFiles", id: "scripts", name: "Scripts", detail: "Story and logic written in sparkdown." },
  { key: "imageFiles", id: "images", name: "Images", detail: "Backdrops, portraits and other pictures." },
  { key: "audioFiles", id: "audio", name: "Audio", detail: "Sounds and music the game plays." },
  { key: "fontFiles", id: "fonts", name: "Fonts", detail: "Typefaces for the game's text." },
] as const;

type FileTypeKey = (typeof FILE_TYPES)[number]["key"];

const PROJECT_KEYS = FILE_TYPES.map((type) => type.key);

function FileTypeRow({ type }: { type: (typeof FILE_TYPES)[number] }) {
  const { projectSettings, setProjectSetting } = useSettings();
  const [draft, setDraft] = useState<string>();
  const fallback = PROJECT_SETTINGS_SCHEMA[type.key].default;
  const write = (typed: string) => {
    const pattern = typedPattern(typed, fallback);
    if (pattern !== projectSettings[type.key]) {
      setProjectSetting(type.key as FileTypeKey, pattern);
    }
    return pattern;
  };
  return (
    <TextRow
      id={`file-type-${type.id}`}
      name={type.name}
      detail={type.detail}
      setting={type.key}
      width="wide"
      maxLength={160}
      placeholder={endingsText(fallback)}
      value={draft ?? endingsText(projectSettings[type.key])}
      onValueChange={(next) => {
        setDraft(next);
        write(next);
      }}
      onCommit={(committed) => {
        setDraft(undefined);
        return `${type.name}: ${endingsText(write(committed))}.`;
      }}
    />
  );
}

export default function FileTypesSection({ section }: { section: SettingsSectionInfo }) {
  const { id, title, detail } = section;
  const reset = useSectionReset({ project: PROJECT_KEYS });
  return (
    <SettingsSection id={id} title={title} detail={detail} changed={reset.changed} onReset={reset.onReset}>
      <SettingsList>
        {FILE_TYPES.map((type) => (
          <FileTypeRow key={type.key} type={type} />
        ))}
      </SettingsList>
    </SettingsSection>
  );
}
