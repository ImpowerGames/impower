import { BackIcon, Button } from "@impower/impower-ui/components";
import { useComputed } from "@preact/signals";
import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { routeOfState } from "../../workspace/routes";
import { storyScriptOf, useScriptMode } from "../../workspace/useActiveEditor";
import workspace from "../../workspace/WorkspaceStore";
import { PhoneSearch } from "../find-references-rename";
import BottomNavigation from "./BottomNavigation";
import { useNaming } from "./naming";
import PhoneTitleBar from "./PhoneTitleBar";
import { withWindow, workspaceWindow } from "./workspaceWindow";

function BackToStory({ onBack }: { onBack: () => void }) {
  return (
    <Button
      asChild
      variant="quiet"
      class="-ml-2 justify-start gap-2 px-2 font-normal text-accent"
    >
      <a
        href="#write"
        onClick={(e) => {
          e.preventDefault();
          onBack();
        }}
      >
        <BackIcon />
        Back to story
      </a>
    </Button>
  );
}

export function PhonePreviewBack() {
  return (
    <div class="flex h-12 flex-none items-center border-b border-edge bg-bg px-4">
      <BackToStory
        onBack={() =>
          void workspaceWindow().then((win) => win.collapsePreviewPane())
        }
      />
    </div>
  );
}

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

export default function PhoneShell({
  children,
}: {
  children: ComponentChildren;
}) {
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
      if (workspace.scriptMode.peek() === "editing") {
        void withWindow((win) => win.finishEditing());
      }
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

  useEffect(() => {
    if (previewRevealed && !writing) {
      void workspaceWindow().then((win) => win.collapsePreviewPane());
    }
  }, [previewRevealed, writing]);

  return (
    <div
      data-phone-shell
      data-naming={naming ?? undefined}
      data-editing={editing ? "" : undefined}
      class="flex h-full min-h-0 w-full flex-col"
    >
      <PhoneTitleBar scrolled={!writing && scrolled} />
      <div
        class="relative flex min-h-0 flex-1"
        onScrollCapture={(e) => {
          const target = e.target as HTMLElement;
          setScrolled(target.scrollTop > 2);
        }}
      >
        {children}
      </div>
      <PhoneSearch />
      <BottomNavigation />
    </div>
  );
}
