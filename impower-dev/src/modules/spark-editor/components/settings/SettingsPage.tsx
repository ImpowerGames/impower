import {
  JumpChips,
  PageFrame,
  SettingsPlaceholder,
} from "@impower/impower-ui/components";
import { useLayout } from "@impower/impower-ui/layout";
import type { FunctionComponent } from "preact";
import { useEffect } from "preact/hooks";
import { backToStory } from "../../workspace/backToStory";
import { sectionOfHash } from "../../workspace/routes";
import AddMenuSection from "./AddMenuSection";
import AppearanceSection from "./AppearanceSection";
import FileTypesSection from "./FileTypesSection";
import MetadataSection from "./MetadataSection";
import PreviewSection from "./PreviewSection";
import SaveSyncSection from "./SaveSyncSection";
import ScreenplaySection from "./ScreenplaySection";
import ScriptEditorSection from "./ScriptEditorSection";
import {
  SETTINGS_INDEX,
  SETTINGS_SCOPES,
  SETTINGS_SECTION_IDS,
  type SettingsSectionId,
  type SettingsSectionInfo,
} from "./sections";
import { jumpToSection, watchSections } from "./settingsNavigation";
import ShortcutsSection from "./ShortcutsSection";

const SECTION_BODIES: Partial<
  Record<SettingsSectionId, FunctionComponent<{ section: SettingsSectionInfo }>>
> = {
  "theme-preferences": AppearanceSection,
  "editor-preferences": ScriptEditorSection,
  "shortcut-preferences": ShortcutsSection,
  "preview-preferences": PreviewSection,
  "story-details": MetadataSection,
  "screenplay-settings": ScreenplaySection,
  "add-folder-preferences": AddMenuSection,
  "file-types": FileTypesSection,
  "save-settings": SaveSyncSection,
};

const SETTINGS_PAGE_ID = "settings-page";

export default function SettingsPage() {
  const layout = useLayout();

  useEffect(() => {
    const element = document.getElementById(SETTINGS_PAGE_ID);
    if (!element) {
      return;
    }
    const dispose = watchSections(element, SETTINGS_SECTION_IDS);
    const land = () => {
      const id = sectionOfHash(window.location.hash);
      if (id) {
        jumpToSection(id, { smooth: false });
      }
    };
    land();
    window.addEventListener("hashchange", land);
    return () => {
      window.removeEventListener("hashchange", land);
      dispose();
    };
  }, []);

  return (
    <PageFrame
      id={SETTINGS_PAGE_ID}
      eyebrow="Editor & project preferences"
      title="Settings"
      line="Customize the look and behavior of the editor and adjust your project settings."
      onBack={() => void backToStory()}
    >
      <JumpChips
        label="Settings sections"
        groups={SETTINGS_INDEX}
        onJump={(id) => jumpToSection(id)}
        class={
          layout === "desktop"
            ? "-mt-3.5 mb-7 hidden group-data-[sidebar=collapsed]/sidebar:block"
            : "-mt-3.5 mb-7 block phone:mt-0"
        }
      />
      <div class="grid gap-11 compact:gap-9">
        {SETTINGS_SCOPES.map((scope, index) => [
          <header
            key={scope.id}
            id={scope.id}
            class={
              index === 0
                ? "-mb-4 scroll-mt-4"
                : "-mb-4 scroll-mt-4 border-t border-solid border-edge pt-9 compact:pt-7"
            }
          >
            <h2
              tabIndex={-1}
              class="m-0 mb-1 text-[22px]/[1.3] font-semibold tracking-[-0.01em] compact:text-[20px]"
            >
              {scope.label}
            </h2>
          </header>,
          ...scope.sections.map((section) => {
            const Body = SECTION_BODIES[section.id];
            if (Body) {
              return <Body key={section.id} section={section} />;
            }
            return (
              <SettingsPlaceholder
                key={section.id}
                id={section.id}
                title={section.title}
                detail={"detail" in section ? section.detail : undefined}
              />
            );
          }),
        ])}
      </div>
    </PageFrame>
  );
}
