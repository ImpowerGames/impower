import { Binder, Pacman, Router, Tab, Tabs } from "@impower/impower-ui/components";
import { startTransition } from "preact/compat";
import workspace from "../../workspace/WorkspaceStore";
import ShareGame from "../share-game/ShareGame";
import ShareScreenplay from "../share-screenplay/ShareScreenplay";

export const propDefaults = {};
export type ShareProps = Partial<typeof propDefaults>;

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
