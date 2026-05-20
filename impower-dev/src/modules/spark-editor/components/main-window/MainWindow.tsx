import {
  Bolt,
  BoltFill,
  Photo,
  PhotoFill,
  Share,
  ShareFill,
  SplitPane,
  Tab,
  Tabs,
} from "@impower/impower-ui/components";
import { useEffect, useRef, useState } from "preact/hooks";
import { startTransition } from "preact/compat";
import { Workspace } from "../../workspace/Workspace";
import workspace from "../../workspace/WorkspaceStore";

// Vite injects impower-ui's Tailwind output into document.head as <style
// data-vite-dev-id="...impower-ui/src/style.css">. <spark-editor> uses shadow
// DOM, so those styles don't cascade in. On mount we mirror the Vite-injected
// styles into the host shadow root so utility classes (flex, w-full, ...) used
// by SplitPane/Tabs actually apply.
function adoptImpowerUiStyles(root: ShadowRoot) {
  const TW_MARK = "data-impower-ui-tw";
  const adopt = () => {
    const sources = document.querySelectorAll<HTMLStyleElement>(
      'style[data-vite-dev-id*="impower-ui"]',
    );
    for (const src of sources) {
      const key = src.dataset.viteDevId ?? src.textContent?.slice(0, 32) ?? "";
      if (root.querySelector(`style[${TW_MARK}="${CSS.escape(key)}"]`)) continue;
      const clone = document.createElement("style");
      clone.setAttribute(TW_MARK, key);
      clone.textContent = src.textContent;
      root.appendChild(clone);
    }
  };
  adopt();
  const obs = new MutationObserver(adopt);
  obs.observe(document.head, { childList: true, subtree: true });
  return () => obs.disconnect();
}

type PaneType = "logic" | "assets" | "share";

const STYLE = `
  se-main-window {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
  }
  .mw-root {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-height: 0;
  }
  .mw-body {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
  }
  .mw-pane {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
  }
  .mw-pane--end {
    background-color: black;
  }
  .mw-bottom-nav {
    position: relative;
    flex: 0 0 auto;
    /* Match sparkle's --theme-size-footer-nav (60px). Without this the bar
       ends up ~55px from Tab padding alone. */
    height: var(--theme-size-footer-nav, 60px);
    border-top: 1px solid var(--theme-color-fg-10, #1f1f1f);
    background-color: var(--theme-color-primary-bg, #0b1426);
    color: var(--theme-color-fg, #fff);
  }
  .mw-bottom-nav > * {
    height: 100%;
  }
  /* sparkle's adopted normalize sets * { flex-flow: column; ... } unlayered,
     which beats Tailwind's layered utility rules. Re-declare the handful of
     Tailwind classes we depend on, unlayered with class specificity, so they
     win inside the MainWindow tree. */
  .mw-root .flex-row { flex-direction: row; }
  .mw-root .flex-col { flex-direction: column; }
  .mw-root .items-stretch { align-items: stretch; }
  .mw-root .items-center { align-items: center; }
  .mw-root .justify-center { justify-content: center; }
  .mw-root .flex-wrap { flex-wrap: wrap; }
  .mw-root .flex-1 { flex: 1 1 0%; min-width: 0; }
`;

export const propDefaults = {};
export type MainWindowProps = Partial<typeof propDefaults>;

export default function MainWindow(_props: MainWindowProps) {
  const pane = workspace.signals.pane.value as PaneType;
  const [previewActive, setPreviewActive] = useState<"start" | "end">("start");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current?.getRootNode?.();
    if (root instanceof ShadowRoot) {
      const dispose = adoptImpowerUiStyles(root);
      return () => dispose();
    }
    return;
  }, []);

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
    // Mark the workspace-store update (and the resulting <se-logic> /
    // <se-assets> / <se-share> mount) as a low-priority transition, so the
    // tab activation animation (color + scale) gets to paint before the
    // potentially-heavy pane DOM is built.
    startTransition(() => {
      Workspace.window.openedPane(next as PaneType);
    });
  };

  return (
    <div class="mw-root" ref={rootRef}>
      <style>{STYLE}</style>
      {/* @ts-expect-error legacy custom element */}
      <se-header-navigation />
      <div class="mw-body">
        <SplitPane
          activePanel={previewActive}
          minSize="320px"
          collapseBelow={960}
          start={
            <div class="mw-pane">
              {/* @ts-expect-error legacy custom element */}
              {pane === "logic" && <se-logic />}
              {/* @ts-expect-error legacy custom element */}
              {pane === "assets" && <se-assets />}
              {/* @ts-expect-error legacy custom element */}
              {pane === "share" && <se-share />}
            </div>
          }
          end={
            <div class="mw-pane mw-pane--end">
              {/* @ts-expect-error legacy custom element */}
              <se-preview />
            </div>
          }
        />
      </div>
      {/* @ts-expect-error legacy custom element */}
      <se-notifications />
      <div class="mw-bottom-nav">
        <Tabs value={pane} onChange={onPaneChange} indicator="none">
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
