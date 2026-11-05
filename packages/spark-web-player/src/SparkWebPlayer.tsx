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
  playLabel: "PLAY",
  playButton: false,
  toolbar: false,
  fullscreenButton: false,
  skipButtons: false,
  stepButtons: false,
};

export type SparkWebPlayerProps = Partial<typeof propDefaults>;

const flag = (v: unknown): boolean =>
  v !== false && v !== "false" && v != null;

export default function SparkWebPlayer({
  playLabel,
  playButton,
  toolbar,
  fullscreenButton,
  skipButtons,
  stepButtons,
}: SparkWebPlayerProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<HTMLDivElement>(null);
  const gameBackgroundRef = useRef<HTMLDivElement>(null);
  const gameViewRef = useRef<HTMLDivElement>(null);
  const gameUIRef = useRef<HTMLDivElement>(null);
  const playButtonRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const routeButtonRef = useRef<HTMLDivElement>(null);
  const routeListRef = useRef<HTMLDivElement>(null);
  const savesButtonRef = useRef<HTMLDivElement>(null);
  const savesMenuRef = useRef<HTMLDivElement>(null);
  const saveNoteRef = useRef<HTMLDivElement>(null);

  const controllerRef = useRef<GamePlayerControllerType | null>(null);
  const [bar, setBar] = useState<{
    state: PlayerBarState;
    view: PlayerBarView;
  }>({
    state: initialPlayerBarState,
    view: { routeShown: false, snapping: false },
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

      const controller = new GamePlayerController(realHost, {
        viewport,
        game,
        gameBackground,
        gameView,
        gameUI,
        playButton: playButtonRef.current,
        toolbar: toolbarRef.current,
        routeButton: routeButtonRef.current,
        routeList: routeListRef.current,
        savesButton: savesButtonRef.current,
        savesMenu: savesMenuRef.current,
        saveNote: saveNoteRef.current,
      });
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
  }, [flag(playButton), flag(toolbar), flag(fullscreenButton)]);

  return (
    <div id="viewport" ref={viewportRef}>
      <div id="game" ref={gameRef}>
        <div id="game-background" ref={gameBackgroundRef} />
        <div id="game-view" ref={gameViewRef} />
        <div id="game-ui" ref={gameUIRef} />
        {flag(toolbar) ? <div id="save-note" ref={saveNoteRef} /> : null}
        {flag(toolbar) ? <div id="saves-menu" ref={savesMenuRef} /> : null}
        {flag(playButton) ? (
          <div id="play-button" ref={playButtonRef}>
            <svg
              id="play-icon"
              xmlns="http://www.w3.org/2000/svg"
              width="512"
              height="512"
              viewBox="0 0 512 512"
            >
              <path
                fill="currentColor"
                d="M464 256a208 208 0 1 0-416 0a208 208 0 1 0 416 0M0 256a256 256 0 1 1 512 0a256 256 0 1 1-512 0m188.3-108.9c7.6-4.2 16.8-4.1 24.3.5l144 88c7.1 4.4 11.5 12.1 11.5 20.5s-4.4 16.1-11.5 20.5l-144 88c-7.4 4.5-16.7 4.7-24.3.5S176 352.9 176 344.2v-176c0-8.7 4.7-16.7 12.3-20.9z"
              />
            </svg>
            <div id="play-label">{playLabel}</div>
          </div>
        ) : null}
      </div>
      {flag(toolbar) ? (
        <PlayerBar
          state={bar.state}
          controls={{
            skip: flag(skipButtons),
            step: flag(stepButtons),
            fullscreen: flag(fullscreenButton),
          }}
          workspace={bar.view.workspace}
          routeShown={bar.view.routeShown}
          snapping={bar.view.snapping}
          toolbarRef={toolbarRef}
          routeButtonRef={routeButtonRef}
          savesButtonRef={savesButtonRef}
          onSkip={(direction) => void controllerRef.current?.skipBeat(direction)}
          onPause={() => void controllerRef.current?.pauseGame()}
          onResume={() => void controllerRef.current?.resumeGame()}
          onStep={(traversal) => void controllerRef.current?.stepGame(traversal)}
          onToggleFullscreen={() => controllerRef.current?.toggleFullscreen()}
        />
      ) : null}
      {flag(toolbar) ? (
        <div id="route-list" ref={routeListRef} hidden />
      ) : null}
    </div>
  );
}

export { setWorkspace } from "./GamePlayerController";
