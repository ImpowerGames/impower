import { BackIcon, Button } from "@impower/impower-ui/components";
import { useComputed } from "@preact/signals";
import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { routeOfState } from "../../workspace/routes";
import { storyScriptOf } from "../../workspace/useActiveEditor";
import workspace from "../../workspace/WorkspaceStore";
import Account from "../account/Account";
import BottomNavigation from "./BottomNavigation";
import { useNaming } from "./naming";
import PhoneTitleBar from "./PhoneTitleBar";

const withWindow = async () =>
  (await import("../../workspace/Workspace")).Workspace.window;

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

function PhoneSettings() {
  return (
    <section
      aria-label="Settings"
      data-phone-route="project"
      class="absolute inset-0 z-10 flex flex-col overflow-y-auto bg-bg"
    >
      <div class="flex flex-none flex-col gap-1 px-4 pt-3 pb-2">
        <BackToStory
          onBack={() =>
            void withWindow().then((win) => win.navigateTo("write"))
          }
        />
        <h1 class="text-[22px]/[1.3] font-semibold text-ink">Settings</h1>
      </div>
      <Account />
    </section>
  );
}

export function PhonePreviewBack() {
  return (
    <div class="flex h-12 flex-none items-center border-b border-edge bg-bg px-4">
      <BackToStory
        onBack={() =>
          void withWindow().then((win) => win.collapsePreviewPane())
        }
      />
    </div>
  );
}

export default function PhoneShell({
  children,
}: {
  children: ComponentChildren;
}) {
  const route = useComputed(() => routeOfState(workspace.state.value)).value;
  const naming = useNaming();
  const writing = useComputed(() => storyScriptOf() !== undefined).value;
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => setScrolled(false), [route]);

  return (
    <div
      data-phone-shell
      data-naming={naming ?? undefined}
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
        {route === "project" && <PhoneSettings />}
      </div>
      <BottomNavigation />
    </div>
  );
}
