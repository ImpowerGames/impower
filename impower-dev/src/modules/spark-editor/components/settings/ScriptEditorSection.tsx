import {
  Select,
  SelectRow,
  SettingsGroup,
  SettingsList,
  SettingsSection,
  SwitchRow,
  type SelectOption,
} from "@impower/impower-ui/components";
import SparkdownScriptSample from "@impower/sparkdown-document-views/src/modules/script-sample/SparkdownScriptSample";
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import type { PreferenceKey, Preferences } from "../../workspace/settings/settingsSchema";
import { useSettings } from "../../workspace/settings/useSettings";
import workspaceSettings from "../../workspace/settings/WorkspaceSettings";
import type { SettingsSectionInfo } from "./sections";
import { SCRIPT_SAMPLES, type ScriptSampleId } from "./scriptSamples";
import { useSectionReset } from "./useSectionReset";

type SwitchKey = {
  [K in PreferenceKey]: Preferences[K] extends boolean ? K : never;
}[PreferenceKey];

type SwitchSpec = {
  readonly key: SwitchKey;
  readonly name: string;
  readonly detail: ComponentChildren;
};

const Mark = ({ children }: { children: string }) => <span class="opacity-55">{children}</span>;

const APPEARANCE_SWITCHES: readonly SwitchSpec[] = [
  { key: "boldDeclarationNames", name: "Bold declaration names", detail: "Show names bolded when declaring them." },
  { key: "boldSpeakerNames", name: "Bold speaker names", detail: "Show speaker cues bolded." },
  {
    key: "boldContainerNames",
    name: "Bold container names",
    detail: "Show container names bolded inside of construct declarations.",
  },
  { key: "tintedDialogue", name: "Tinted dialogue", detail: "Tint dialogue to distinguish it from action text." },
  { key: "italicComments", name: "Italic comments", detail: "Italicize all comments." },
  {
    key: "emphasizeMarkup",
    name: "Emphasize markup",
    detail: (
      <>
        Show{" "}
        <i>
          <Mark>*</Mark>italic<Mark>*</Mark>
        </i>
        ,{" "}
        <b>
          <Mark>**</Mark>bold<Mark>**</Mark>
        </b>
        , and{" "}
        <u>
          <Mark>_</Mark>underline<Mark>_</Mark>
        </u>{" "}
        the way the reader will see them.
      </>
    ),
  },
  {
    key: "highlightMatchingSymbols",
    name: "Highlight matching symbols",
    detail: "When the caret is on a scene, branch, character or asset name, light up its other uses in the script.",
  },
  {
    key: "hoverPreviews",
    name: "Hover previews",
    detail: "When hovering over an image name, show a popup preview of the image.",
  },
];

const ASSISTANCE_SWITCHES: readonly SwitchSpec[] = [
  {
    key: "suggestAutocompletions",
    name: "Suggest autocompletions",
    detail: "Suggestions for names and keywords appear as you type them.",
  },
  {
    key: "autoRenameFiles",
    name: "Auto-rename asset files",
    detail: "Renaming an asset reference in the script renames all linked asset files too.",
  },
  { key: "autoCloseBrackets", name: "Auto-close angle brackets", detail: "Typing < automatically closes it with >." },
];

const INDENT_GUIDE_OPTIONS: readonly SelectOption<Preferences["indentGuides"]>[] = [
  { value: "off", label: "Off" },
  { value: "block", label: "Current block" },
  { value: "all", label: "All levels" },
];

const SAMPLE_OPTIONS: readonly SelectOption<ScriptSampleId>[] = SCRIPT_SAMPLES.map(({ value, label }) => ({
  value,
  label,
}));

export const SCRIPT_EDITOR_PREFERENCES: readonly PreferenceKey[] = [
  ...APPEARANCE_SWITCHES.map((spec) => spec.key),
  "indentGuides",
  ...ASSISTANCE_SWITCHES.map((spec) => spec.key),
];

function Switches({ specs }: { specs: readonly SwitchSpec[] }) {
  const { preferences, setPreference } = useSettings();
  return (
    <>
      {specs.map((spec) => (
        <SwitchRow
          key={spec.key}
          id={`script-${spec.key}`}
          name={spec.name}
          detail={spec.detail}
          setting={spec.key}
          checked={preferences[spec.key]}
          onCheckedChange={(checked) => setPreference(spec.key, checked)}
        />
      ))}
    </>
  );
}

function ScriptSample() {
  const [sampleId, setSampleId] = useState<ScriptSampleId>("dialogue");
  const sample = SCRIPT_SAMPLES.find((candidate) => candidate.value === sampleId) ?? SCRIPT_SAMPLES[0];
  const caret = "caret" in sample ? sample.text.indexOf(sample.caret) : undefined;
  return (
    <div class="overflow-hidden rounded-[10px] border border-solid border-edge bg-panel">
      <div class="flex items-center justify-between gap-3 border-b border-solid border-edge py-2 pr-2 pl-4 phone:flex-wrap phone:px-3">
        <label class="flex min-w-0 items-center gap-2.5 text-[13px] text-muted phone:flex-[1_1_100%] phone:justify-between">
          Sample
          <Select<ScriptSampleId>
            id="theme-sample"
            options={SAMPLE_OPTIONS}
            value={sampleId}
            onValueChange={setSampleId}
          />
        </label>
      </div>
      <SparkdownScriptSample
        text={sample.text}
        caret={caret}
        appearance={workspaceSettings.scriptAppearance.value}
        label="Read-only syntax sample"
        class="max-h-[540px] overflow-auto bg-workspace phone:max-h-[440px]"
      />
      <p class="m-0 border-t border-solid border-edge px-4 py-3 text-[13px]/[1.5] text-muted">
        Highlight matching symbols and Hover previews need your open script, so this sample does not show them.
      </p>
    </div>
  );
}

export default function ScriptEditorSection({ section }: { section: SettingsSectionInfo }) {
  const { preferences, setPreference } = useSettings();
  const reset = useSectionReset({ preferences: SCRIPT_EDITOR_PREFERENCES });
  return (
    <SettingsSection id={section.id} title={section.title} {...reset}>
      <SettingsGroup legend="Script appearance">
        <SettingsList>
          <Switches specs={APPEARANCE_SWITCHES} />
          <SelectRow
            id="script-indentGuides"
            name="Show indentation guides"
            detail="Show a line beside each indented block. Current block shows only the line for the block the caret is in; All levels shows the line for every block and highlights the line for the current block."
            setting="indentGuides"
            options={INDENT_GUIDE_OPTIONS}
            value={preferences.indentGuides}
            onValueChange={(mode) => setPreference("indentGuides", mode)}
          />
        </SettingsList>
      </SettingsGroup>
      <SettingsGroup legend="Try it on the page">
        <ScriptSample />
      </SettingsGroup>
      <SettingsGroup legend="Editing assistance">
        <SettingsList>
          <Switches specs={ASSISTANCE_SWITCHES} />
        </SettingsList>
      </SettingsGroup>
    </SettingsSection>
  );
}
