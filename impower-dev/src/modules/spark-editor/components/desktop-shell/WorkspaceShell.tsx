import { SidebarLayout } from "@impower/impower-ui/components";
import { useLayout, useRailDefault } from "@impower/impower-ui/layout";
import { useComputed } from "@preact/signals";
import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { RAIL_COMPACT_WIDTH, RAIL_WIDTH } from "../../workspace/railWidths";
import { routeOfState } from "../../workspace/routes";
import { storyScriptOf, useScriptMode } from "../../workspace/useActiveEditor";
import workspace from "../../workspace/WorkspaceStore";
import { PhoneSearch } from "../find-references-rename";
import BottomNavigation from "./BottomNavigation";
import { useNaming } from "./naming";
import PhoneTitleBar from "./PhoneTitleBar";
import ShellRail from "./ShellRail";
import TopBar from "./TopBar";
import { withWindow, workspaceWindow } from "./workspaceWindow";

const takesEditingAway = (target: EventTarget | null) => {
  if (!(target instanceof Element) || target.closest("[data-keyboard-panel]")) {
    return false;
  }
  const surface = target.closest(
    '[role="menu"], [role="dialog"], [role="alertdialog"]',
  );
  return (
    !!surface &&
    !surface.matches("[data-action-sheet]") &&
    !surface.querySelector("[data-action-sheet]")
  );
};

export default function WorkspaceShell({
  phone,
  strip,
  children,
}: {
  phone: boolean;
  strip?: ComponentChildren;
  children: ComponentChildren;
}) {
  const compact = useLayout() === "compact";
  const railDefault = useRailDefault();
  const shell = useComputed(() => workspace.state.value.shell).value;
  const railWidth = compact ? shell?.railCompactWidth : shell?.railWidth;
  const route = useComputed(() => routeOfState(workspace.state.value)).value;
  const naming = useNaming();
  const writing = useComputed(() => storyScriptOf() !== undefined).value;
  const previewRevealed = useComputed(
    () => !!workspace.state.value.preview?.revealed,
  ).value;
  const [scrolled, setScrolled] = useState(false);
  const editing = useScriptMode() === "editing";

  useEffect(() => setScrolled(false), [route]);

  useEffect(() => {
    if (editing && !writing) {
      void withWindow((win) => win.finishEditing());
    }
  }, [editing, writing]);

  useEffect(
    () => () => {
      void withWindow((win) => win.finishEditing());
    },
    [],
  );

  useEffect(() => {
    if (!editing) {
      return;
    }
    const onFocusIn = (event: FocusEvent) => {
      if (takesEditingAway(event.target)) {
        void withWindow((win) => win.finishEditing());
      }
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, [editing]);

  const onStory = writing && route === "write";

  useEffect(() => {
    if (phone && previewRevealed && !onStory) {
      void workspaceWindow().then((win) => win.collapsePreviewPane());
    }
  }, [phone, previewRevealed, onStory]);

  const onWidthChange = async (width: number | undefined) => {
    const { Workspace } = await import("../../workspace/Workspace");
    if (compact) {
      Workspace.window.setRailCompactWidth(width);
    } else {
      Workspace.window.setRailWidth(width);
    }
  };

  const limits = compact
    ? {
        default:
          railDefault === "full"
            ? RAIL_COMPACT_WIDTH.full
            : RAIL_COMPACT_WIDTH.collapsed,
        min: RAIL_COMPACT_WIDTH.full,
        max: RAIL_COMPACT_WIDTH.full,
        collapsed: RAIL_COMPACT_WIDTH.collapsed,
        reserve: RAIL_COMPACT_WIDTH.reserve,
      }
    : RAIL_WIDTH;

  return (
    <div
      data-phone-shell={phone ? "" : undefined}
      data-naming={phone ? (naming ?? undefined) : undefined}
      data-editing={phone && editing ? "" : undefined}
      class="flex h-full w-full min-h-0 flex-col"
    >
      <SidebarLayout
        width={railWidth ?? limits.default}
        defaultWidth={limits.default}
        minWidth={limits.min}
        maxWidth={limits.max}
        collapsedWidth={limits.collapsed}
        reserve={limits.reserve}
        onWidthChange={onWidthChange}
        resizeLabel="Resize sidebar"
        header={
          phone ? (
            <>
              <PhoneTitleBar scrolled={!writing && scrolled} />
              <div data-phone-strip="" hidden={!onStory} class="flex-none">
                {strip}
              </div>
            </>
          ) : (
            <TopBar />
          )
        }
        sidebar={phone ? null : <ShellRail />}
        sidebarHidden={phone}
        footer={
          phone ? (
            <>
              <PhoneSearch />
              <BottomNavigation />
            </>
          ) : null
        }
      >
        <div
          class="relative flex h-full min-h-0 w-full"
          onScrollCapture={
            phone
              ? (e) => {
                  const target = e.target as HTMLElement;
                  setScrolled(target.scrollTop > 2);
                }
              : undefined
          }
        >
          {children}
        </div>
      </SidebarLayout>
    </div>
  );
}
