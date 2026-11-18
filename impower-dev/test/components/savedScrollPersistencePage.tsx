import { render } from "preact";
import { useSavedScroll } from "../../src/modules/spark-editor/components/library-page/pageState";
import WorkspaceWindow from "../../src/modules/spark-editor/workspace/WorkspaceWindow";
import workspace, { savedWorkspaceState } from "../../src/modules/spark-editor/workspace/WorkspaceStore";

const KEY = "image:Assets/Images/Cast:name-asc";

const opened = new WorkspaceWindow({} as ConstructorParameters<typeof WorkspaceWindow>[0]);

const storedTop = () => savedWorkspaceState().lists?.assetsScrolls?.[KEY];

function Scroller() {
  return (
    <div data-scroller ref={useSavedScroll("assetsScrolls", KEY)} style="height:200px;overflow:auto">
      <div style="height:10000px" />
    </div>
  );
}

declare global {
  interface Window {
    persistencePage: {
      opened: WorkspaceWindow;
      mount: () => void;
      stored: () => number | undefined;
      scrollTop: () => number;
      scrollTo: (top: number) => void;
      recordStoredAtPageHide: () => void;
      storedAtPageHide: () => string | null;
    };
  }
}

window.persistencePage = {
  opened,
  mount: () => {
    if (workspace.current.lists?.assetsScrolls?.[KEY] === undefined) {
      opened.setListState({ assetsScrolls: { [KEY]: 1000 } });
      opened.persistNow();
    }
    render(<Scroller />, document.body.appendChild(document.createElement("div")));
  },
  stored: storedTop,
  scrollTop: () => document.querySelector<HTMLElement>("[data-scroller]")!.scrollTop,
  scrollTo: (top) => {
    document.querySelector<HTMLElement>("[data-scroller]")!.scrollTop = top;
  },
  recordStoredAtPageHide: () =>
    window.addEventListener("pagehide", () => sessionStorage.setItem("storedAtPageHide", String(storedTop()))),
  storedAtPageHide: () => sessionStorage.getItem("storedAtPageHide"),
};
