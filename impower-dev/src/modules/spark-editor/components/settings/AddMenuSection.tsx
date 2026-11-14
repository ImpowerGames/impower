import {
  ArrowIcon,
  Button,
  PortraitThumbnail,
  portraitCropLabel,
  SettingsGroup,
  SettingsList,
  SettingsSection,
  SliderRow,
  TextRow,
} from "@impower/impower-ui/components";
import { useState } from "preact/hooks";
import { PORTRAIT_CROP } from "../../workspace/settings/settingsSchema";
import { useSettings } from "../../workspace/settings/useSettings";
import {
  ADD_MENU_FOLDER_SETTINGS,
  ADD_MENU_KINDS,
  addMenuFiles,
  addMenuFolderProblem,
  addMenuFolders,
  type AddMenuKind,
} from "../../utils/addMenuFolders";
import { pickerItems } from "../add-panel";
import { useProjectFiles } from "./useProjectFiles";
import type { SettingsSectionInfo } from "./sections";
import { useSectionReset } from "./useSectionReset";

const ROWS: Record<AddMenuKind, { readonly name: string; readonly unit: string }> = {
  backdrop: { name: "Backdrop", unit: "backdrop file" },
  portrait: { name: "Portrait", unit: "portrait file" },
  music: { name: "Music", unit: "music file" },
  sound: { name: "Sound", unit: "sound file" },
};

const PROJECT_KEYS = ADD_MENU_KINDS.map((kind) => ADD_MENU_FOLDER_SETTINGS[kind]);

export const folderCountText = (count: number, unit: string): string =>
  count ? `Contains ${count} ${unit}${count === 1 ? "" : "s"}` : "Contains nothing yet";

function FolderRow({ kind, count }: { kind: AddMenuKind; count: number }) {
  const { projectSettings, setProjectSetting } = useSettings();
  const key = ADD_MENU_FOLDER_SETTINGS[kind];
  const saved = projectSettings[key];
  const [draft, setDraft] = useState<string>();
  const [refusal, setRefusal] = useState<{ readonly message: string; readonly kept: string }>();
  const problem = refusal?.kept === saved ? refusal.message : undefined;
  const { name, unit } = ROWS[kind];
  return (
    <TextRow
      id={`add-folder-${kind}`}
      name={name}
      setting={key}
      detail={folderCountText(count, unit)}
      problem={problem}
      value={draft ?? saved}
      onValueChange={(next) => {
        setDraft(next);
        setRefusal(undefined);
      }}
      onCommit={(committed) => {
        setDraft(undefined);
        const reason = addMenuFolderProblem(committed);
        if (reason) {
          const message = `${reason}, so ${saved} is kept.`;
          setRefusal({ message, kept: saved });
          return `${name}: ${message}`;
        }
        const accepted = committed.trim();
        if (accepted !== saved) {
          setProjectSetting(key, accepted);
        }
        return `${name}: ${accepted}.`;
      }}
    />
  );
}

export default function AddMenuSection({ section }: { section: SettingsSectionInfo }) {
  const { id, title, detail } = section;
  const { preferences, projectSettings, setPreference } = useSettings();
  const files = useProjectFiles();
  const folders = addMenuFolders(projectSettings);
  const reset = useSectionReset({ project: PROJECT_KEYS, preferences: ["portraitCrop"] });
  const crop = preferences.portraitCrop;
  const example = addMenuFiles(files, "portrait", folders)[0];
  return (
    <SettingsSection
      id={id}
      title={title}
      detail={detail}
      changed={reset.changed}
      onReset={reset.onReset}
      actions={
        <Button variant="quiet" asChild>
          <a href="#write?insert=backdrop" data-try-add>
            Try in Add
            <ArrowIcon />
          </a>
        </Button>
      }
    >
      <SettingsGroup legend="Folders">
        <SettingsList>
          {ADD_MENU_KINDS.map((kind) => (
            <FolderRow key={kind} kind={kind} count={pickerItems(kind, files, folders).length} />
          ))}
        </SettingsList>
      </SettingsGroup>
      <SettingsGroup
        id="portrait-preferences"
        legend="Portrait thumbnails"
        note="Choose how much of each portrait to show for portrait thumbnails in the Add menu."
      >
        <SettingsList>
          <SliderRow
            id="portrait-crop"
            name="Visible area"
            setting="portraitCrop"
            value={crop}
            min={PORTRAIT_CROP.min}
            max={PORTRAIT_CROP.max}
            step={PORTRAIT_CROP.step}
            valueText={portraitCropLabel}
            scale={["Top 25%", "Whole image"]}
            hint="Used for thumbnails only. Does not affect the size of the portrait in your game."
            onValueChange={(next) => setPreference("portraitCrop", next)}
            aside={
              <div class="grid grid-cols-2 gap-3" data-portrait-examples>
                <figure class="m-0 min-w-0">
                  <PortraitThumbnail size="example" src={example?.src} crop={PORTRAIT_CROP.max} />
                  <figcaption class="mt-1.5 text-center text-[12px]/[1.5] text-muted">Original</figcaption>
                </figure>
                <figure class="m-0 min-w-0">
                  <PortraitThumbnail size="example" src={example?.src} crop={crop} />
                  <figcaption class="mt-1.5 text-center text-[12px]/[1.5] text-muted">Thumbnail</figcaption>
                </figure>
                {!example && (
                  <p class="col-span-2 m-0 text-center text-[12px]/[1.5] text-muted" data-portrait-examples-hint>
                    The examples use a portrait from your {folders.portrait} folder.
                  </p>
                )}
              </div>
            }
          />
        </SettingsList>
      </SettingsGroup>
    </SettingsSection>
  );
}
