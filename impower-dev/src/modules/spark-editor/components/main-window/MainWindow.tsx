import {
  Bolt,
  BoltFill,
  Photo,
  PhotoFill,
  Router,
  Share,
  ShareFill,
  SplitPane,
  Tab,
  Tabs,
} from "@impower/impower-ui/components";
import { useEffect, useState } from "preact/hooks";
import { startTransition } from "preact/compat";
import workspace from "../../workspace/WorkspaceStore";
import Assets from "../assets/Assets";
import HeaderNavigation from "../header-navigation/HeaderNavigation";
import Logic from "../logic/Logic";
import Preview from "../preview/Preview";
import SharePanel from "../share/Share";

type PaneType = "logic" | "assets" | "share";

export const propDefaults = {};
export type MainWindowProps = Partial<typeof propDefaults>;

export default function MainWindow(_props: MainWindowProps) {
  const pane = workspace.signals.pane.value as PaneType;
  // workspace.state's `pane` defaults to "logic", but the user's actual choice
  // lives in localStorage and only lands after restoreProjectWorkspace() (async,
  // inside WorkspaceWindow's constructor) completes. Highlighting Logic
  // pre-restore and then snapping through the intermediate states to the real
  // pane is jarring. Suppress active-tab highlighting until projectId is set
  // — that's the signal that restoreProjectWorkspace has run to completion.
  const workspaceReady = !!workspace.signals.projectId.value;
  const [previewActive, setPreviewActive] = useState<"start" | "end">("start");

  useEffect(() => {
    let dispose: (() => void) | undefined;
    Promise.all([
      import("@impower/spark-editor-protocol/src/protocols/MessageProtocol"),
      import(
        "@impower/spark-editor-protocol/src/protocols/window/DidExpandPreviewPaneMessage"
      ),
      import(
        "@impower/spark-editor-protocol/src/protocols/window/DidCollapsePreviewPaneMessage"
      ),
    ]).then(
      ([
        { MessageProtocol },
        { DidExpandPreviewPaneMessage },
        { DidCollapsePreviewPaneMessage },
      ]) => {
        const onProtocol = (e: Event) => {
          if (!(e instanceof CustomEvent)) return;
          if (DidExpandPreviewPaneMessage.type.is(e.detail)) {
            setPreviewActive("end");
          } else if (DidCollapsePreviewPaneMessage.type.is(e.detail)) {
            setPreviewActive("start");
          }
        };
        window.addEventListener(MessageProtocol.event, onProtocol);
        dispose = () =>
          window.removeEventListener(MessageProtocol.event, onProtocol);
      },
    );
    return () => dispose?.();
  }, []);

  const onPaneChange = (next: string) => {
    // Mark the workspace-store update (and the resulting Logic / Assets
    // / SharePanel mount) as a low-priority transition, so the tab
    // activation animation (color + scale) gets to paint before the
    // potentially-heavy pane DOM is built.
    startTransition(() => {
      void import("../../workspace/Workspace").then(({ Workspace }) => {
        Workspace.window.openedPane(next as PaneType);
      });
    });
  };

  // SplitPane wraps react-resizable-panels which calls React hooks. In dev
  // SSR (preact-render-to-string) those hooks throw "invalid hook call"
  // because real React isn't running. Skip the split during SSR — the
  // header + bottom-nav (the visible chrome on first paint) still get
  // statically rendered. The middle fills in once Preact hydrates.
  const isSSR = typeof window === "undefined";

  return (
    <div class="flex flex-col w-full h-full min-h-0">
      <HeaderNavigation />
      <div class="relative flex flex-1 min-h-0">
        {!isSSR && (
          <SplitPane
            activePanel={previewActive}
            minSize="320px"
            collapseBelow={960}
            start={
              <div class="relative flex flex-col w-full h-full">
                <Router active={pane} mode="fade">
                  <Logic key="logic" />
                  <Assets key="assets" />
                  <SharePanel key="share" />
                </Router>
              </div>
            }
            end={
              <div class="relative flex flex-col w-full h-full bg-black">
                <Preview />
              </div>
            }
          />
        )}
      </div>
      <div
        class="relative flex-none h-[60px] bg-engine-800 text-foreground [&>*]:h-full"
      >
        {/* 1px white/6% divider hugging the top edge — mirrors main's
            <s-divider bg-color="fg-06"> above the bottom-nav tabs. The
            !h-px overrides the parent's [&>*]:h-full selector which
            otherwise stretches the divider to the full 60px nav height. */}
        <div class="absolute inset-x-0 top-0 !h-px bg-white/[0.06] z-10" />
        <Tabs
          // Keep Radix in controlled mode — passing null/undefined makes
          // Radix uncontrolled, where it briefly activates ALL triggers
          // until our first value lands. A non-matching sentinel pins it
          // to "controlled, but no tab matches" so all tabs stay inactive.
          value={workspaceReady ? pane : "__none__"}
          onChange={onPaneChange}
          indicator="none"
        >
          <Tab value="logic" icon={Bolt} activeIcon={BoltFill}>
            Logic
          </Tab>
          <Tab value="assets" icon={Photo} activeIcon={PhotoFill}>
            Assets
          </Tab>
          <Tab value="share" icon={Share} activeIcon={ShareFill}>
            Share
          </Tab>
        </Tabs>
      </div>
    </div>
  );
}
