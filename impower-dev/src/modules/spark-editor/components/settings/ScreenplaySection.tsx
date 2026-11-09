import {
  Button,
  SelectRow,
  SettingsGroup,
  SettingsList,
  SettingsSection,
  SwitchRow,
  TextRow,
} from "@impower/impower-ui/components";
import { useLayout } from "@impower/impower-ui/layout";
import {
  PAPER_SIZE_OPTIONS,
  SCENE_NUMBER_OPTIONS,
  SCREENPLAY_SETTING_KEYS,
} from "../../workspace/settings/screenplaySettings";
import {
  PROJECT_SETTINGS_SCHEMA,
  SETTING_TEXT_MAX_LENGTH,
  type ProjectSettings,
} from "../../workspace/settings/settingsSchema";
import { useSettings } from "../../workspace/settings/useSettings";
import type { SettingsSectionInfo } from "./sections";
import { useSectionReset } from "./useSectionReset";

type BooleanKey = {
  [K in keyof ProjectSettings]: ProjectSettings[K] extends boolean ? K : never;
}[keyof ProjectSettings];

type TextKey = "screenplayMore" | "screenplayContd";

const showPreview = async (desktop: boolean) => {
  const { Workspace } = await import("../../workspace/Workspace");
  Workspace.window.setPreviewMode("screenplay");
  if (!desktop) {
    Workspace.window.expandPreviewPane();
  }
};

export default function ScreenplaySection({ section }: { section: SettingsSectionInfo }) {
  const { id, title, detail } = section;
  const layout = useLayout();
  const { projectSettings: settings, setProjectSetting } = useSettings();
  const { changed, onReset } = useSectionReset({ project: SCREENPLAY_SETTING_KEYS });

  const on = (key: BooleanKey, name: string, rowDetail: string, sub?: { disabled: boolean }) => (
    <SwitchRow
      id={`${id}-${key}`}
      name={name}
      detail={rowDetail}
      setting={key}
      indent={sub ? "sub" : undefined}
      disabled={sub?.disabled}
      checked={settings[key]}
      onCheckedChange={(next) => setProjectSetting(key, next)}
    />
  );

  const words = (key: TextKey, name: string, rowDetail: string) => (
    <TextRow
      id={`${id}-${key}`}
      name={name}
      detail={rowDetail}
      setting={key}
      indent="sub"
      width="short"
      font="mono"
      maxLength={SETTING_TEXT_MAX_LENGTH}
      disabled={!settings.screenplaySplitDialogue}
      placeholder={PROJECT_SETTINGS_SCHEMA[key].default}
      value={settings[key]}
      onValueChange={(next) => setProjectSetting(key, next)}
    />
  );

  return (
    <SettingsSection
      id={id}
      title={title}
      detail={detail}
      changed={changed}
      onReset={onReset}
      actions={
        <Button variant="quiet" onClick={() => void showPreview(layout === "desktop")}>
          Show preview
        </Button>
      }
    >
      <SettingsGroup
        legend="Printed when previewing or exporting"
        note="These settings affect the appearance of the screenplay when previewing or exporting it."
      >
        <SettingsList>
          {on("screenplayTitlePage", "Title page", "Print a title page for the screenplay.")}
          {on("screenplayHeadingsBold", "Bold headings", "Print headings in bold.")}
          <SelectRow
            id={`${id}-screenplaySceneNumbers`}
            name="Heading numbers"
            detail="Number each heading in the margin, like a shooting script does."
            setting="screenplaySceneNumbers"
            options={SCENE_NUMBER_OPTIONS}
            value={settings.screenplaySceneNumbers}
            onValueChange={(next) => setProjectSetting("screenplaySceneNumbers", next)}
          />
          {on("screenplaySceneNames", "Scene names", "Print scene names where they are declared.")}
          {on("screenplayBranchNames", "Branch names", "Print branch names where they are declared.")}
          {on("screenplayFunctionNames", "Function names", "Print function names where they are declared.")}
        </SettingsList>
      </SettingsGroup>
      <SettingsGroup
        legend="Printed when exporting to PDF"
        note="Apart from the paper size, these settings do not affect the in-engine preview."
      >
        <SettingsList>
          <SelectRow
            id={`${id}-screenplayPaperSize`}
            name="Paper size"
            detail="The size of the paper to print to. The screenplay preview's page takes its proportions."
            setting="screenplayPaperSize"
            options={PAPER_SIZE_OPTIONS}
            value={settings.screenplayPaperSize}
            onValueChange={(next) => setProjectSetting("screenplayPaperSize", next)}
          />
          {on(
            "screenplayPageNumbers",
            "Page numbers",
            "Print the current page number in the top right corner of each page.",
          )}
          {on(
            "screenplaySplitDialogue",
            "Allow dialogue to be split across page breaks",
            "Dialogue that doesn't fit on the page continues onto the next page, with (MORE) and (CONT'D).",
          )}
          {words("screenplayMore", "Bottom of the page", "Shown below dialogue that continues on the next page.")}
          {words("screenplayContd", "Top of the next page", "Shown beside the speaker's name for continued dialogue.")}
          {on("screenplayBookmarks", "Bookmarks", "A bookmark in the PDF's sidebar for each scene and branch.")}
          {on(
            "screenplayHiddenBookmarks",
            "Bookmark hidden section names",
            "Scene and branch names get a bookmark even when they're not printed on the page.",
            { disabled: !settings.screenplayBookmarks },
          )}
        </SettingsList>
      </SettingsGroup>
    </SettingsSection>
  );
}
