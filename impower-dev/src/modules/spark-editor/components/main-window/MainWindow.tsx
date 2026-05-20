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
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { startTransition } from "preact/compat";
import workspace from "../../workspace/WorkspaceStore";
import HeaderNavigation from "../header-navigation/HeaderNavigation";

// Workspace's top-level instantiates WorkspaceWindow whose constructor touches
// localStorage / window — fine in the browser, fatal during SSR. Defer until
// the handler actually fires.

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
      const key = src.dataset["viteDevId"] ?? src.textContent?.slice(0, 32) ?? "";
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
  // workspace.state's `pane` defaults to "logic", but the user's actual choice
  // lives in localStorage and only lands after restoreProjectWorkspace() (async,
  // inside WorkspaceWindow's constructor) completes. Highlighting Logic
  // pre-restore and then snapping through the intermediate states to the real
  // pane is jarring. Suppress active-tab highlighting until projectId is set
  // — that's the signal that restoreProjectWorkspace has run to completion.
  const workspaceReady = !!workspace.signals.projectId.value;
  const [previewActive, setPreviewActive] = useState<"start" | "end">("start");
  const rootRef = useRef<HTMLDivElement>(null);

  // useLayoutEffect (not useEffect) — Tailwind has to land in the shadow
  // root BEFORE the browser paints MainWindow's first render. With useEffect
  // there's one frame where the shadow tree has Preact's just-rendered DOM
  // but no Tailwind to style it, producing a visible "snap from unstyled
  // to styled" flash on every hydration.
  useLayoutEffect(() => {
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
    <div
      class="mw-root flex flex-col w-full h-full min-h-0"
      ref={rootRef}
    >
      <style>{STYLE}</style>
      <HeaderNavigation />
      <div class="relative flex flex-auto min-h-0">
        {!isSSR && (
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
        )}
      </div>
      {/* @ts-expect-error legacy custom element */}
      <se-notifications />
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
