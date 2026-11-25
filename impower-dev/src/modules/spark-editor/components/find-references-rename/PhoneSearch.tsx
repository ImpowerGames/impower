import { useComputed } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { storyScriptOf } from "../../workspace/useActiveEditor";
import { withWindow } from "../desktop-shell/workspaceWindow";
import workspace from "../../workspace/WorkspaceStore";
import { ToolPanel, ToolPanelRoot } from "../tool-panel";
import PhoneFindBar from "./PhoneFindBar";
import ReferencesView from "./ReferencesView";
import RenameView from "./RenameView";
import { searchTitle } from "./scriptTitle";
import useSearchInPanel from "./useSearchInPanel";
import { withSearch } from "./withSearch";

const close = () => withSearch((search) => search.close());

const dismiss = () => withSearch((search) => search.dismiss());

const openFromPanel = () => {};

function PanelSearch() {
  const snapshot = workspace.search.value;
  const { open, view } = snapshot;
  const story = useComputed(() => storyScriptOf() !== undefined).value;

  const finding = open && view === "find";
  const wasFinding = useRef(finding);

  useEffect(() => {
    const opened = finding && !wasFinding.current;
    wasFinding.current = finding;
    if (!finding || story) {
      return;
    }
    if (opened) {
      void withWindow((win) => win.navigateTo("story"));
    } else {
      close();
    }
  }, [finding, story]);

  const sheetOpen = open && view !== "find";
  const lastSheet = useRef(snapshot);
  if (sheetOpen) {
    lastSheet.current = snapshot;
  }
  const held = lastSheet.current;
  const bar =
    finding && story ? (
      <ToolPanelRoot
        presentation="bar"
        open
        onOpen={openFromPanel}
        onClose={dismiss}
      >
        <ToolPanel open chrome="none" title={searchTitle(snapshot)} onClose={dismiss}>
          <PhoneFindBar />
        </ToolPanel>
      </ToolPanelRoot>
    ) : null;
  if (!held.open || held.view === "find") {
    return bar;
  }
  return (
    <>
      {bar}
      <ToolPanelRoot
        presentation="sheet"
        open={sheetOpen}
        onOpen={openFromPanel}
        onClose={dismiss}
      >
        <ToolPanel
          open={sheetOpen}
          title={searchTitle(held)}
          closeLabel={held.view === "references" ? "Close references" : "Close rename"}
          onClose={dismiss}
        >
          {held.view === "references" ? (
            <ReferencesView onOpened={close} />
          ) : (
            <RenameView />
          )}
        </ToolPanel>
      </ToolPanelRoot>
    </>
  );
}

export default function PhoneSearch() {
  return useSearchInPanel() ? <PanelSearch /> : null;
}
