import {
  Button,
  FactRow,
  FileIcon,
  SettingsList,
  SettingsSection,
} from "@impower/impower-ui/components";
import { useComputed } from "@preact/signals";
import workspace from "../../workspace/WorkspaceStore";
import type { SettingsSectionInfo } from "./sections";
import { storyMetadata } from "./storyMetadata";

const editMain = async () => {
  const { Workspace } = await import("../../workspace/Workspace");
  await Workspace.window.editMainAt(0);
};

export default function MetadataSection({ section }: { section: SettingsSectionInfo }) {
  const { id, title, detail } = section;
  const metadata = useComputed(() => storyMetadata(workspace.storyFrontMatter.value)).value;
  return (
    <SettingsSection
      id={id}
      title={title}
      detail={detail}
      actions={
        <Button variant="quiet" data-edit-main onClick={() => void editMain()}>
          <FileIcon />
          Edit in Main
        </Button>
      }
    >
      <SettingsList as="dl">
        <FactRow term="Title" multiline>
          <span data-metadata-title>{metadata.title}</span>
        </FactRow>
        <FactRow term="Author">
          <span data-metadata-author>{metadata.author}</span>
        </FactRow>
      </SettingsList>
    </SettingsSection>
  );
}
