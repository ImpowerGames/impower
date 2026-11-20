import {
  BreakpointIcon,
  Button,
  ContinueIcon,
  StepIntoIcon,
  StepOutIcon,
  StepOverIcon,
  type IconComponent,
} from "@impower/impower-ui/components";
import workspace from "../../workspace/WorkspaceStore";
import { useCaretScript } from "../../workspace/useActiveEditor";
import type WorkspaceWindow from "../../workspace/WorkspaceWindow";
import workspaceShortcuts from "../../workspace/shortcuts/WorkspaceShortcuts";
import type { GameState } from "@impower/spark-editor-protocol/src/types";
import {
  STEP_SHORTCUTS,
  stepRefusals,
  type StepTraversal,
} from "../../workspace/stepStates";

export const DEBUG_TOOLBAR = "Debug controls";

export const CONTINUE = "Continue";

export const TOGGLE_BREAKPOINT = "Toggle breakpoint";

export const NO_CARET_REASON =
  "Put the caret on a script line to toggle its breakpoint.";

const STEPS: readonly {
  traversal: StepTraversal;
  label: string;
  icon: IconComponent;
}[] = [
  { traversal: "over", label: "Step Over", icon: StepOverIcon },
  { traversal: "in", label: "Step Into", icon: StepIntoIcon },
  { traversal: "out", label: "Step Out", icon: StepOutIcon },
];

export const isStopped = (game: GameState | undefined) =>
  !!game?.running && !game.ended && !!game.paused;

const withWindow = async (act: (window: WorkspaceWindow) => unknown) => {
  const { Workspace } = await import("../../workspace/Workspace");
  act(Workspace.window);
};

function ToolbarButton({
  label,
  icon: Icon,
  reason,
  title,
  class: className,
  onClick,
}: {
  label: string;
  icon: IconComponent;
  reason?: string;
  title?: string;
  class?: string;
  onClick: () => void;
}) {
  return (
    <Button
      variant="quiet"
      size="icon"
      aria-label={label}
      title={reason ?? title ?? label}
      aria-disabled={reason ? true : undefined}
      onClick={reason ? undefined : onClick}
      class={`${className ?? "text-ink"} aria-disabled:cursor-default aria-disabled:opacity-40`}
    >
      <Icon />
    </Button>
  );
}

export default function PreviewDebugToolbar() {
  const game = workspace.state.value.preview?.modes?.game;
  const session = workspace.debugSession.value;
  const caretScript = useCaretScript();
  if (!isStopped(game)) {
    return null;
  }
  const refusals = stepRefusals(game, session);
  return (
    <div
      role="toolbar"
      aria-label={DEBUG_TOOLBAR}
      data-debug-toolbar
      class="pointer-events-auto flex items-center rounded-toolbar-menu border border-solid border-edge bg-popup p-0.5 shadow-toolbar-menu"
    >
      <ToolbarButton
        label={CONTINUE}
        icon={ContinueIcon}
        class="text-accent"
        onClick={() => void withWindow((window) => window.unpauseGame())}
      />
      {STEPS.map(({ traversal, label, icon }) => (
        <ToolbarButton
          key={traversal}
          label={label}
          icon={icon}
          reason={refusals[traversal]}
          title={workspaceShortcuts.title(STEP_SHORTCUTS[traversal], label)}
          onClick={() => void withWindow((window) => window.stepGame(traversal))}
        />
      ))}
      <span
        role="separator"
        aria-orientation="vertical"
        class="mx-0.5 h-6 w-px shrink-0 bg-edge"
      />
      <ToolbarButton
        label={TOGGLE_BREAKPOINT}
        icon={BreakpointIcon}
        reason={caretScript ? undefined : NO_CARET_REASON}
        onClick={() =>
          void withWindow((window) =>
            caretScript ? window.toggleBreakpointAtCaret(caretScript) : undefined,
          )
        }
      />
    </div>
  );
}
