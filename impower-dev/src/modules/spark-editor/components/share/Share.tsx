import { Binder, Pacman, Router, Tab, Tabs } from "@impower/impower-ui/components";
import { startTransition } from "preact/compat";
import workspace from "../../workspace/WorkspaceStore";
import ShareGame from "../share-game/ShareGame";
import ShareScreenplay from "../share-screenplay/ShareScreenplay";

export const propDefaults = {};
export type ShareProps = Partial<typeof propDefaults>;

// se-share lives inside spark-editor's shadow root, which has Tailwind
// adopted at upgrade time. preact-custom-element wraps this in
// shadow:false, so the rendered children land in the host's light DOM
// (i.e. spark-editor's shadow) and pick up Tailwind too.
const HOST_STYLE = `
  se-share {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
  }
`;

type Panel = "game" | "screenplay";

/**
 * Share pane wrapper. Top sub-tabs switch between Game and Screenplay
 * export options. Mirrors the legacy se-share's <s-router> behavior but
 * uses impower-ui's Tabs underneath for accessibility (roving tabindex,
 * arrow-key navigation, ARIA role wiring).
 */
export default function Share(_props: ShareProps) {
  const panel = (workspace.state.value.panes?.share?.panel || "game") as Panel;

  const onPanelChange = (next: string) => {
    startTransition(() => {
      void import("../../workspace/Workspace").then(({ Workspace }) => {
        Workspace.window.openedPanel("share", next);
      });
    });
  };

  return (
    <>
      <style>{HOST_STYLE}</style>
      <div class="sticky top-0 z-10 flex-none bg-engine-900">
        <Tabs
          value={panel}
          onChange={onPanelChange}
          indicator="underline"
          iconLayout="beside"
        >
          <Tab value="game" icon={Pacman}>
            Game
          </Tab>
          <Tab value="screenplay" icon={Binder}>
            Screenplay
          </Tab>
        </Tabs>
      </div>
      <div class="relative flex-1 min-h-0">
        <Router active={panel} mode="slide-x">
          <ShareGame key="game" />
          <ShareScreenplay key="screenplay" />
        </Router>
      </div>
    </>
  );
}
