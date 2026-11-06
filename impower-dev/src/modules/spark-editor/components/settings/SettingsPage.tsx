import {
  BackIcon,
  Button,
  JumpChips,
  SettingsPlaceholder,
} from "@impower/impower-ui/components";
import { useLayout } from "@impower/impower-ui/layout";
import type { FunctionComponent } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { sectionOfHash } from "../../workspace/routes";
import Account from "../account/Account";
import AppearanceSection from "./AppearanceSection";
import PreviewSection from "./PreviewSection";
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
};

const backToStory = async () => {
  const { Workspace } = await import("../../workspace/Workspace");
  Workspace.window.navigateTo("write");
};

export default function SettingsPage() {
  const layout = useLayout();
  const page = useRef<HTMLElement>(null);

  useEffect(() => {
    const element = page.current;
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
    <section
      ref={page}
      id="settings-page"
      aria-label="Settings"
      class="@container/page relative h-full min-h-0 w-full overflow-y-auto bg-workspace pt-[34px] pb-[46px] text-ink compact:py-[30px] phone:pt-[25px] phone:pb-[85px]"
    >
      <div
        class="mx-auto box-content max-w-[930px] px-[min(36px,6cqi)] compact:px-[min(30px,6cqi)] phone:px-5"
      >
        <div
          class="mb-[34px] flex items-center justify-between gap-5 phone:mb-[25px] phone:items-start phone:gap-3"
        >
          <div>
            <div class="text-eyebrow text-accent uppercase">Editor &amp; project preferences</div>
            <h1
              class="mt-2.5 mb-3 font-serif text-[40px]/[1.12] font-normal tracking-[-0.035em] compact:my-2.5 compact:text-[32px]/[1.15] phone:my-2.5 phone:text-[32px]/[1.15]"
            >
              Settings
            </h1>
            <p class="m-0 max-w-[550px] text-body text-muted">
              Customize the look and behavior of the editor and adjust your project settings.
            </p>
          </div>
          <Button
            variant="quiet"
            class="compact:hidden phone:hidden"
            onClick={() => void backToStory()}
          >
            <BackIcon />
            Back to story
          </Button>
        </div>
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
                >
                  {section.id === "save-settings" && (
                    <div class="mt-3 overflow-hidden rounded-[10px] border border-solid border-edge bg-panel">
                      <Account />
                    </div>
                  )}
                </SettingsPlaceholder>
              );
            }),
          ])}
        </div>
      </div>
    </section>
  );
}
