import { useEffect, useRef, useState } from "preact/hooks";
import type {
  GamePlayerController as GamePlayerControllerType,
  PlayerBarView,
} from "./GamePlayerController";
import PlayerBar from "./components/PlayerBar/PlayerBar";
import {
  initialPlayerBarState,
  type PlayerBarState,
} from "./components/PlayerBar/playerBarState";

export const propDefaults = {
  toolbar: false,
  runButton: false,
  fullscreenButton: false,
  skipButtons: false,
  stepButtons: false,
  hostDisplay: false,
};

export type SparkWebPlayerProps = Partial<typeof propDefaults>;

const flag = (v: unknown): boolean =>
  v !== false && v !== "false" && v != null;

export default function SparkWebPlayer({
  toolbar,
  runButton,
  fullscreenButton,
  skipButtons,
  stepButtons,
  hostDisplay,
}: SparkWebPlayerProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<HTMLDivElement>(null);
  const gameBackgroundRef = useRef<HTMLDivElement>(null);
  const gameViewRef = useRef<HTMLDivElement>(null);
  const gameUIRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const routeButtonRef = useRef<HTMLDivElement>(null);
  const routeListRef = useRef<HTMLDivElement>(null);
  const savesButtonRef = useRef<HTMLDivElement>(null);
  const savesMenuRef = useRef<HTMLDivElement>(null);
  const saveNoteRef = useRef<HTMLDivElement>(null);

  const controllerRef = useRef<GamePlayerControllerType | null>(null);
  const strip = flag(toolbar) && !flag(hostDisplay);
  const [bar, setBar] = useState<{
    state: PlayerBarState;
    view: PlayerBarView;
  }>({
    state: initialPlayerBarState,
    view: { routeShown: false, snapping: false, starting: false },
  });

  useEffect(() => {
    const viewport = viewportRef.current;
    const game = gameRef.current;
    const gameBackground = gameBackgroundRef.current;
    const gameView = gameViewRef.current;
    const gameUI = gameUIRef.current;
    if (!viewport || !game || !gameBackground || !gameView || !gameUI) return;

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    import("./GamePlayerController").then(({ GamePlayerController }) => {
      if (cancelled) return;

      const realHost = viewport.closest(
        "spark-web-player",
      ) as HTMLElement | null;
      if (!realHost) return;

      const controller = new GamePlayerController(
        realHost,
        {
          viewport,
          game,
          gameBackground,
          gameView,
          gameUI,
          toolbar: toolbarRef.current,
          routeButton: routeButtonRef.current,
          routeList: routeListRef.current,
          savesButton: savesButtonRef.current,
          savesMenu: savesMenuRef.current,
          saveNote: saveNoteRef.current,
        },
        { resizable: !flag(hostDisplay), hosted: flag(hostDisplay) },
      );
      unsubscribe = controller.subscribeBar((state, view) =>
        setBar({ state, view }),
      );
      controller.setup();
      controllerRef.current = controller;
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
      controllerRef.current?.dispose();
      controllerRef.current = null;
    };
  }, [
    flag(toolbar),
    flag(fullscreenButton),
    flag(hostDisplay),
  ]);

  return (
    <div id="viewport" ref={viewportRef}>
      <div id="game" ref={gameRef}>
        <div id="game-background" ref={gameBackgroundRef} />
        <div id="game-view" ref={gameViewRef} />
        <div id="game-ui" ref={gameUIRef} />
        {flag(toolbar) ? (
          <div
            id="save-note"
            ref={saveNoteRef}
            data-hosted={flag(hostDisplay) ? "" : undefined}
          />
        ) : null}
        {strip ? <div id="saves-menu" ref={savesMenuRef} /> : null}
      </div>
      {strip ? (
        <PlayerBar
          state={bar.state}
          controls={{
            run: flag(runButton),
            skip: flag(skipButtons),
            step: flag(stepButtons),
            fullscreen: flag(fullscreenButton),
            resize: true,
          }}
          workspace={bar.view.workspace}
          routeShown={bar.view.routeShown}
          snapping={bar.view.snapping}
          toolbarRef={toolbarRef}
          routeButtonRef={routeButtonRef}
          savesButtonRef={savesButtonRef}
          runRefusal={bar.view.runRefusal}
          starting={bar.view.starting}
          onRun={() => void controllerRef.current?.run()}
          onStop={() => void controllerRef.current?.stop()}
          onSkip={(direction) => void controllerRef.current?.skipBeat(direction)}
          onPause={() => void controllerRef.current?.pauseGame()}
          onResume={() => void controllerRef.current?.resumeGame()}
          onStep={(traversal) => void controllerRef.current?.stepGame(traversal)}
          onToggleFullscreen={() => controllerRef.current?.toggleFullscreen()}
        />
      ) : null}
      {strip ? <div id="route-list" ref={routeListRef} hidden /> : null}
    </div>
  );
}

export { setWorkspace } from "./GamePlayerController";
