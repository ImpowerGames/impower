import {
  PropsWithChildren,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import Measure from "react-measure";
import {
  GameProjectData,
  generateEntityObjects,
  generateSectionBlocks,
  getScriptAugmentations,
  loadStyles,
  loadUI,
  SaveData,
  SparkGame,
  SparkGameRunner,
} from "../../../../spark-engine";
import { getSectionAtLine, parseSpark } from "../../../../sparkdown";
import { ProjectEngineContext } from "../../impower-route-engine/contexts/projectEngineContext";
import { useGameStyle } from "../hooks/gameHooks";
import { PhaserGame } from "../types/game/phaserGame";
import UI from "./UI";

const createGame = (
  project: GameProjectData,
  activeLine: number,
  debugging: boolean,
  saveData?: SaveData
): SparkGame => {
  const script = project?.scripts?.data?.logic;
  const files = project?.files?.data;
  const seed =
    project?.instances?.configs?.data?.DebugConfig?.randomizationSeed;

  const result = parseSpark(script, getScriptAugmentations(files), {
    lineOffset: 1,
  });
  const blockMap = generateSectionBlocks(result?.sections);
  const objectMap = generateEntityObjects(result?.entities);
  const [startBlockId] = getSectionAtLine(activeLine, result);
  const startRuntimeBlock = blockMap?.[startBlockId];
  let startCommandIndex = 0;
  const startCommands = Object.values(startRuntimeBlock?.commands);
  for (let i = 1; i < startCommands?.length || 0; i += 1) {
    const command = startCommands[i];
    if (command.line > activeLine) {
      break;
    } else {
      startCommandIndex = i;
    }
  }
  const game = new SparkGame(
    blockMap,
    objectMap,
    {
      startBlockId,
      startCommandIndex,
      seed,
      debugging,
    },
    saveData
  );
  return game;
};

interface GameProps {
  startTime: number;
  active: boolean;
  control: "Play" | "Pause";
  project: GameProjectData;
  debugging?: boolean;
  game?: SparkGame;
  runner?: SparkGameRunner;
  saveData?: SaveData;
  logoSrc?: string;
  onInitialized: () => void;
  onCreateGame: (game?: SparkGame) => void;
}

export const Game = (props: PropsWithChildren<GameProps>): JSX.Element => {
  const {
    startTime,
    active,
    control,
    project,
    debugging,
    game,
    runner,
    saveData,
    logoSrc,
    children,
    onInitialized,
    onCreateGame,
  } = props;

  const phaserGameRef = useRef<PhaserGame>();
  const [phaserGame, setPhaserGame] = useState(phaserGameRef.current);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const gameDivRef = useRef<HTMLDivElement>(null);

  const gameStyle = useGameStyle(phaserGame);

  const [state] = useContext(ProjectEngineContext);
  const projectId = state?.project?.id;
  const activeLine = state?.panel?.panels?.logic?.cursor?.fromLine || 1;

  useEffect(() => {
    if (phaserGameRef.current) {
      if (debugging) {
        phaserGameRef.current.sparkContext.game.debug.startDebugging();
      } else {
        phaserGameRef.current.sparkContext.game.debug.stopDebugging();
      }
    }
  }, [debugging]);

  useEffect(() => {
    // Destroy game when this component is unmounted or game is changed
    if (phaserGame) {
      phaserGame.destroy(true);
    }
    const onEnd = (): void => {
      onCreateGame();
    };
    if (active) {
      phaserGameRef.current = new PhaserGame(
        project,
        projectId,
        game,
        runner,
        control,
        logoSrc
      );
      setPhaserGame(phaserGameRef.current);
      onInitialized();
      if (game) {
        game.events.onEnd.addListener(onEnd);
      }
    }
    return (): void => {
      if (game) {
        game.events.onEnd.removeListener(onEnd);
      }
      // Destroy game when this component is unmounted or game is changed
      if (phaserGame) {
        phaserGame.destroy(true);
      }
    };
  }, [game]); // eslint-disable-line react-hooks/exhaustive-deps

  const isFirstUILoad = useRef(true);
  const script = project?.scripts?.data?.logic;
  const files = project?.files?.data;
  useEffect(() => {
    if (script && isFirstUILoad.current) {
      isFirstUILoad.current = false;
      const result = parseSpark(script, getScriptAugmentations(files), {
        lineOffset: 1,
      });
      const objectMap = generateEntityObjects(result?.entities);
      loadStyles(objectMap, ...Object.keys(objectMap?.style || {}));
      loadUI(objectMap, ...Object.keys(objectMap?.ui || {}));
    }
  }, [script, files]);

  useEffect(() => {
    if (active) {
      const g = createGame(project, activeLine, debugging, saveData);
      onCreateGame(g);
    } else {
      onCreateGame();
    }
    if (phaserGame) {
      if (
        JSON.stringify(
          phaserGame?.project?.instances?.configs?.data?.ScaleConfig
        ) !== JSON.stringify(project?.instances?.configs?.data?.ScaleConfig)
      ) {
        phaserGame.destroy(true);
        phaserGameRef.current = new PhaserGame(
          project,
          projectId,
          game,
          runner,
          control,
          logoSrc
        );
        setPhaserGame(phaserGameRef.current);
        onInitialized();
      }
      phaserGame.updateProject(project);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (active) {
      const g = createGame(project, activeLine, debugging, saveData);
      onCreateGame(g);
    } else {
      onCreateGame();
    }
    if (phaserGame) {
      phaserGame.updateProject(project);
    }
  }, [saveData, startTime, active]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (phaserGame) {
      phaserGame.controlScenes(control);
    }
  }, [control]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleResize = (): void => {
    if (phaserGame) {
      phaserGame.scale.dirty = true;
    }
  };

  return (
    <Measure bounds innerRef={wrapperRef} onResize={handleResize}>
      {({ measureRef }): JSX.Element => (
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            ...phaserGame?.getScreenStyle(),
          }}
          ref={measureRef}
        >
          {phaserGame && (
            <div
              id="game-background"
              style={{ ...gameStyle, ...phaserGame?.getGameStyle() }}
            />
          )}
          <div
            ref={gameDivRef}
            id="game"
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
            }}
          />
          <UI phaserGame={phaserGame} />
          {children}
        </div>
      )}
    </Measure>
  );
};

export default Game;
