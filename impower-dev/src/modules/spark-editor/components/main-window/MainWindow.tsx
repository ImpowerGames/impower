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

// Two CSS concerns that fundamentally can't be Tailwind utilities; everything
// else on the rendered tree is plain Tailwind classes:
//   1. Host-only rule. The <se-main-window> custom-element host can't carry
//      its own classes; its display/sizing has to be a CSS rule.
//   2. Scoped unlayered overrides for the handful of Tailwind utilities that
//      compete with sparkle's `* { flex-flow: column; flex-shrink: 0;
//      min-width: 0; max-width: 100% }` global reset. Even after wrapping
//      sparkle's normalize in @layer normalize, the reset still beats
//      Tailwind's @layer utilities in this shadow-DOM cascade — adopted
//      stylesheets and <style> elements maintain separate layer hierarchies,
//      and the order doesn't fall the way the spec text suggests for
//      single-stylesheet cascades. Unlayered always wins, so redeclaring the
//      conflicting utilities unlayered (scoped to .mw-root so it can't bleed
//      anywhere unexpected) is the path that actually works.
const STYLE = `
  se-main-window {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
  }
  .mw-root .flex-row { flex-direction: row; }
  .mw-root .flex-col { flex-direction: column; }
  .mw-root .flex-wrap { flex-wrap: wrap; }
  .mw-root .flex-1 { flex: 1 1 0%; min-width: 0; }
  .mw-root .items-stretch { align-items: stretch; }
  .mw-root .items-center { align-items: center; }
  .mw-root .justify-center { justify-content: center; }
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
    <div
      class="mw-root flex flex-col w-full h-full min-h-0"
      ref={rootRef}
    >
      <style>{STYLE}</style>
      {/* @ts-expect-error legacy custom element */}
      <se-header-navigation />
      <div class="relative flex flex-auto min-h-0">
        <SplitPane
          activePanel={previewActive}
          minSize="320px"
          collapseBelow={960}
          start={
            <div class="relative flex flex-col w-full h-full">
              {/* @ts-expect-error legacy custom element */}
              {pane === "logic" && <se-logic />}
              {/* @ts-expect-error legacy custom element */}
              {pane === "assets" && <se-assets />}
              {/* @ts-expect-error legacy custom element */}
              {pane === "share" && <se-share />}
            </div>
          }
          end={
            <div class="relative flex flex-col w-full h-full bg-black">
              {/* @ts-expect-error legacy custom element */}
              <se-preview />
            </div>
          }
        />
      </div>
      {/* @ts-expect-error legacy custom element */}
      <se-notifications />
      <div
        class="relative flex-none h-[60px] border-t border-fg-10 bg-engine-800 text-fg [&>*]:h-full"
      >
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
