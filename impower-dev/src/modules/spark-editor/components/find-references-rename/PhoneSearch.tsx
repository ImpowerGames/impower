import { useComputed } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { storyScriptOf } from "../../workspace/useActiveEditor";
import workspace from "../../workspace/WorkspaceStore";
import { ToolPanel, ToolPanelRoot } from "../tool-panel";
import PhoneFindBar from "./PhoneFindBar";
import ReferencesView from "./ReferencesView";
import RenameView from "./RenameView";
import { searchTitle } from "./scriptTitle";
import { withSearch } from "./withSearch";

const close = () => withSearch((search) => search.close());

const openFromPanel = () => {};

export default function PhoneSearch() {
  const snapshot = workspace.search.value;
  const { open, view } = snapshot;
  const story = useComputed(() => storyScriptOf() !== undefined).value;

  useEffect(() => {
    if (open && view === "find" && !story) {
      close();
    }
  }, [open, view, story]);

  if (!open) {
    return null;
  }
  const title = searchTitle(snapshot);
  if (view === "find") {
    return story ? (
      <ToolPanelRoot
        presentation="bar"
        open
        onOpen={openFromPanel}
        onClose={close}
      >
        <ToolPanel open chrome="none" title={title} onClose={close}>
          <PhoneFindBar />
        </ToolPanel>
      </ToolPanelRoot>
    ) : null;
  }
  return (
    <ToolPanelRoot open onOpen={openFromPanel} onClose={close}>
      <ToolPanel
        open
        title={title}
        closeLabel={view === "references" ? "Close references" : "Close rename"}
        onClose={close}
      >
        {view === "references" ? (
          <ReferencesView onOpened={close} />
        ) : (
          <RenameView />
        )}
      </ToolPanel>
    </ToolPanelRoot>
  );
}
