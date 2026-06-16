import { ArrowLeft, Button, Menu } from "@impower/impower-ui/components";
import { useComputed } from "@preact/signals";
import { createPortal } from "preact/compat";
import { useEffect, useState } from "preact/hooks";
import workspace from "../../workspace/WorkspaceStore";
import Account from "../account/Account";

export const propDefaults = {};
export type HeaderMenuButtonProps = Partial<typeof propDefaults>;

/**
 * Hamburger button in the top-left of the header. Click opens a left-
 * side drawer with a close button, the "Spark Engine" wordmark + 4-color
 * logo, and the Account widget. Mirrors the legacy
 * `<se-header-menu-button>` (sparkle `<s-drawer>`).
 *
 * The drawer is a plain Preact-native modal — no Radix dependency
 * (its `react-dialog` package's portal helpers were causing CJS-import
 * crashes during Vite SSR module load).
 *
 * Auto-closes when the workspace enters `pickingResource` state (the
 * file-picker preempts the drawer in the legacy too).
 *
 * The inner Account widget stays as a legacy `<se-account>` custom
 * element for now — its own port is a follow-up.
 */
export default function HeaderMenuButton(_p: HeaderMenuButtonProps) {
  const [open, setOpen] = useState(false);
  const pickingResource = useComputed(
    () => !!workspace.state.value.screen?.pickingResource,
  ).value;

  // Close when a resource picker opens — matches legacy `onStoreUpdate`.
  useEffect(() => {
    if (pickingResource && open) setOpen(false);
  }, [pickingResource, open]);

  // Escape closes the drawer.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <Button
        variant="ghost"
        size="icon-lg"
        class="size-14 text-foreground"
        aria-label="Open Menu"
        disabled={pickingResource}
        onClick={() => setOpen(true)}
      >
        <Menu class="size-5" />
      </Button>
      {/* Drawer is portalled to <body> so it escapes the HeaderNavigation
          wrapper's stacking context (`relative z-10`). Without the
          portal, the drawer's own `z-50` only matters within
          HeaderNavigation's z-10 group — siblings like LogicList's
          sticky sub-tabs row (also at z-10 in document root) paint
          ABOVE the drawer because they come later in DOM.

          Drawer container — ALWAYS mounted (just hidden when closed)
          so `<se-account>` stays connected to the DOM from page load.
          Account's `onConnected` calls `Workspace.window.loadProject()`,
          which sets `sync.status = "cached"`; if Account is only
          mounted on first open, the title/caption stay in skeleton
          state forever. The legacy `<s-drawer>` kept its slotted
          children mounted too — only the visual layer toggled. */}
      {typeof document !== "undefined" &&
        createPortal(
      <div
        class={`fixed inset-0 bg-black/50 transition-opacity duration-200 ${
          open ? "" : "pointer-events-none opacity-0"
        }`}
        aria-hidden={open ? undefined : true}
        onClick={(e) => {
          if (e.target === e.currentTarget) setOpen(false);
        }}
        style={{
          // z-index 400 to win against CodeMirror's status bar at z-300
          // (`.cm-panels-bottom`).
          zIndex: 400,
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          class={`flex h-full w-[300px] flex-col bg-engine-800 shadow-xl transition-transform duration-200 ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {/* Drawer header — matches legacy 56px-tall row with close
              button on the left, "Spark Engine" wordmark, and the
              four-color logo on the right. */}
          <div class="flex h-14 flex-none flex-row items-center">
            <Button
              variant="ghost"
              size="icon-lg"
              class="size-14 text-foreground"
              aria-label="Close Menu"
              onClick={() => setOpen(false)}
            >
              <ArrowLeft class="size-5" />
            </Button>
            <div class="flex-1 px-2 text-lg font-medium text-foreground">
              Spark Engine
            </div>
            <div class="mr-4 size-6">
              <SparkLogo />
            </div>
          </div>
          {/* 1px divider — matches legacy `<s-divider>`. */}
          <div class="h-px bg-foreground/[0.12]" />
          {/* Preact-native Account panel. Stays mounted across open/closed
              so its mount-effect (which calls Workspace.window.loadProject)
              fires on page load — see memory:keep_drawer_children_mounted. */}
          <div class="flex flex-1 flex-col">
            <Account />
          </div>
        </div>
      </div>,
          document.body,
        )}
    </>
  );
}

/** The four-quadrant "Spark Engine" logo — verbatim from the legacy. */
function SparkLogo() {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      style="fill-rule:evenodd;clip-rule:evenodd;stroke-linejoin:round;stroke-miterlimit:2"
    >
      <g transform="matrix(1.091742,0,0,1.091742,-11.190351,-11.190351)">
        <path
          d="M10.3,22.1C10.3,11.1 11.1,10.3 22.1,10.3C22.7,10.3 23.3,10.7 23.5,11.3C23.8,12 24.9,16.3 20.6,20.6C16.3,24.9 12,23.8 11.3,23.5C10.7,23.3 10.3,22.7 10.3,22.1Z"
          fill="rgb(255,63,119)"
        />
      </g>
      <g transform="matrix(-1.091742,0,0,-1.091742,43.190351,43.190351)">
        <path
          d="M22.1,10.3C22.7,10.3 23.3,10.7 23.5,11.3C23.8,12 24.9,16.3 20.6,20.6C16.3,24.9 12,23.8 11.3,23.5C10.7,23.3 10.3,22.7 10.3,22.1C10.3,11.1 11.1,10.3 22.1,10.3Z"
          fill="rgb(19,189,254)"
        />
      </g>
      <g transform="matrix(0,-1.091742,1.091742,0,-11.190351,43.190351)">
        <path
          d="M22.1,10.3C22.7,10.3 23.3,10.7 23.5,11.3C23.8,12 24.9,16.3 20.6,20.6C16.3,24.9 12,23.8 11.3,23.5C10.7,23.3 10.3,22.7 10.3,22.1C10.3,11.1 11.1,10.3 22.1,10.3Z"
          fill="rgb(2,208,132)"
        />
      </g>
      <g transform="matrix(0,1.091742,-1.091742,0,43.190351,-11.190351)">
        <path
          d="M22.1,10.3C22.7,10.3 23.3,10.7 23.5,11.3C23.8,12 24.9,16.3 20.6,20.6C16.3,24.9 12,23.8 11.3,23.5C10.7,23.3 10.3,22.7 10.3,22.1C10.3,11.1 11.1,10.3 22.1,10.3Z"
          fill="rgb(250,153,0)"
        />
      </g>
    </svg>
  );
}
