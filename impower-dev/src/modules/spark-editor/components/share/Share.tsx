import {
  Router,
  ScreenplayIcon,
  Tab,
  Tabs,
  VisualIcon,
} from "@impower/impower-ui/components";
import { startTransition } from "preact/compat";
import workspace from "../../workspace/WorkspaceStore";
import ShareGame from "../share-game/ShareGame";
import ShareScreenplay from "../share-screenplay/ShareScreenplay";
import type { PanelType } from "@impower/spark-editor-protocol/src/types";

export const propDefaults = {};
export type ShareProps = Partial<typeof propDefaults>;

type Panel = "game" | "screenplay";

export default function Share(_props: ShareProps) {
  const panel = (workspace.state.value.panes?.share?.panel || "game") as Panel;

  const onPanelChange = (next: string) => {
    startTransition(() => {
      void import("../../workspace/Workspace").then(({ Workspace }) => {
        Workspace.window.openPanel("share", next as PanelType);
      });
    });
  };

  return (
    <>
      <div class="sticky top-0 z-10 flex-none bg-panel">
        <Tabs
          value={panel}
          onChange={onPanelChange}
          indicator="underline"
          iconLayout="beside"
        >
          <Tab value="game" icon={VisualIcon}>
            Game
          </Tab>
          <Tab value="screenplay" icon={ScreenplayIcon}>
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
