import { useEffect, useRef } from "preact/hooks";
import type { GamePlayerController as GamePlayerControllerType } from "./GamePlayerController";

export const propDefaults = {
  playLabel: "PLAY",
  playButton: false,
  toolbar: false,
  fullscreenButton: false,
};

export type SparkWebPlayerProps = Partial<typeof propDefaults>;

// Boolean attribute flag check. preact-custom-element receives the raw DOM
// attribute string, so a presence-only attribute (e.g. `<spark-web-player
// toolbar>`) arrives as `""`, which is falsy. Treat anything other than
// false / "false" / null / undefined as "enabled".
const flag = (v: unknown): boolean =>
  v !== false && v !== "false" && v != null;

// Renders the game player shell (viewport, game container, optional
// playButton overlay, optional toolbar). Bootstraps the GamePlayerController
// in useEffect via dynamic import — the Controller transitively imports
// spark-engine + sparkdown which contain CJS-heavy code that fails Vite SSR.
export default function SparkWebPlayer({
  playLabel,
  playButton,
  toolbar,
  fullscreenButton,
}: SparkWebPlayerProps) {
  // Refs needed by the Controller — `playButton`, `toolbar`, and
  // `fullscreenButton` are optional (only rendered when the corresponding
  // prop is true), so the Controller takes `null` for any absent ref.
  const viewportRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<HTMLDivElement>(null);
  const gameBackgroundRef = useRef<HTMLDivElement>(null);
  const gameViewRef = useRef<HTMLDivElement>(null);
  const gameUIRef = useRef<HTMLDivElement>(null);
  const playButtonRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const leftItemsRef = useRef<HTMLDivElement>(null);
  const locationItemsRef = useRef<HTMLDivElement>(null);
  const launchInfoRef = useRef<HTMLDivElement>(null);
  const launchStateIconRef = useRef<HTMLSpanElement>(null);
  const launchLabelRef = useRef<HTMLSpanElement>(null);
  const executionInfoRef = useRef<HTMLDivElement>(null);
  const connectionLabelRef = useRef<HTMLSpanElement>(null);
  const executedLabelRef = useRef<HTMLSpanElement>(null);
  const aspectRatioLabelRef = useRef<HTMLDivElement>(null);
  const sizeLabelRef = useRef<HTMLDivElement>(null);
  const fullscreenButtonRef = useRef<HTMLDivElement>(null);

  const controllerRef = useRef<GamePlayerControllerType | null>(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    const game = gameRef.current;
    const gameBackground = gameBackgroundRef.current;
    const gameView = gameViewRef.current;
    const gameUI = gameUIRef.current;
    if (!viewport || !game || !gameBackground || !gameView || !gameUI) return;

    let cancelled = false;

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
        leftItems: leftItemsRef.current,
        locationItems: locationItemsRef.current,
        launchInfo: launchInfoRef.current,
        launchStateIcon: launchStateIconRef.current,
        launchLabel: launchLabelRef.current,
        executionInfo: executionInfoRef.current,
        connectionLabel: connectionLabelRef.current,
        executedLabel: executedLabelRef.current,
        aspectRatioLabel: aspectRatioLabelRef.current,
        sizeLabel: sizeLabelRef.current,
        resetButton: null,
        fullscreenButton: fullscreenButtonRef.current,
      });
      controller.setup();
      controllerRef.current = controller;
    });

    return () => {
      cancelled = true;
      controllerRef.current?.dispose();
      controllerRef.current = null;
    };
    // Re-mount the Controller when the conditional refs come/go (playButton,
    // toolbar, fullscreenButton). That's coarser than necessary but rare
    // enough in practice — these are usually fixed at iframe boot time.
  }, [flag(playButton), flag(toolbar), flag(fullscreenButton)]);

  return (
    <div id="viewport" ref={viewportRef}>
      <div id="game" ref={gameRef}>
        <div id="game-background" ref={gameBackgroundRef} />
        <div id="game-view" ref={gameViewRef} />
        <div id="game-ui" ref={gameUIRef} />
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
        <div id="toolbar" ref={toolbarRef}>
          <div id="resize-handle" />
          <div id="left-items" ref={leftItemsRef} hidden>
            <div id="location-items" ref={locationItemsRef}>
              <div id="launch-info" ref={launchInfoRef}>
                <span id="launch-state-icon" ref={launchStateIconRef} />
                <span id="launch-label" ref={launchLabelRef} />
              </div>
              <div id="execution-info" ref={executionInfoRef}>
                <span id="connection-label" ref={connectionLabelRef} />
                <span id="executed-label" ref={executedLabelRef} />
              </div>
            </div>
          </div>
          <div id="middle-items" />
          <div id="right-items">
            <div id="aspect-ratio-label" ref={aspectRatioLabelRef} />
            <div id="size-label" ref={sizeLabelRef} />
            {flag(fullscreenButton) ? (
              <div
                id="fullscreen-button"
                class="toolbar-button"
                ref={fullscreenButtonRef}
              >
                <div id="fullscreen-icon" />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export { setWorkspace } from "./GamePlayerController";
