import { Files, Link, Tab, Tabs } from "@impower/impower-ui/components";
import { startTransition } from "preact/compat";
import workspace from "../../workspace/WorkspaceStore";

export const propDefaults = {};
export type AssetsProps = Partial<typeof propDefaults>;

// Match the same host-sizing pattern used in Share / Preview — preact-custom-
// element shadow:false leaves the host at default inline display, which
// collapses inside the SplitPane.start flex container.
const HOST_STYLE = `
  se-assets {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
  }
`;

type Panel = "files" | "urls";

/**
 * Assets pane wrapper. Top sub-tabs switch between Files and URLs panels.
 * Mirrors the legacy <se-assets>'s <s-router> behavior but uses impower-ui's
 * Tabs underneath (roving tabindex / arrow keys / ARIA wired by Radix).
 *
 * The inner <se-assets-files> and <se-assets-urls> panels stay as legacy
 * spec-components — they're thin configuration wrappers around the legacy
 * <se-file-list> (virtualized list + drag-drop + filename diagnostics +
 * rename-inline editor). Porting that file-list machinery to Preact warrants
 * its own dedicated pass.
 */
export default function Assets(_props: AssetsProps) {
  const panel = (workspace.state.value.panes?.assets?.panel ||
    "files") as Panel;

  const onPanelChange = (next: string) => {
    startTransition(() => {
      void import("../../workspace/Workspace").then(({ Workspace }) => {
        Workspace.window.openedPanel("assets", next);
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
          <Tab value="files" icon={Files}>
            Files
          </Tab>
          <Tab value="urls" icon={Link}>
            URLs
          </Tab>
        </Tabs>
      </div>
      <div class="relative flex-1 min-h-0">
        {/* @ts-expect-error legacy custom element */}
        {panel === "files" && <se-assets-files />}
        {/* @ts-expect-error legacy custom element */}
        {panel === "urls" && <se-assets-urls />}
      </div>
    </>
  );
}
