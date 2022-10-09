import {
  PropsWithChildren,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
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
import { GameApp } from "../classes/GameApp";
import UI from "./UI";

const DOM_ID = "game";

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
    children,
    onInitialized,
    onCreateGame,
  } = props;

  const gameAppRef = useRef<GameApp>();
  const [gameApp, setGameApp] = useState(gameAppRef.current);
  const gameDivRef = useRef<HTMLDivElement>(null);

  const [state] = useContext(ProjectEngineContext);
  const activeLine = state?.panel?.panels?.logic?.cursor?.fromLine || 1;

  useEffect(() => {
    if (gameAppRef.current) {
      if (debugging) {
        gameAppRef.current.sparkContext.game.debug.startDebugging();
      } else {
        gameAppRef.current.sparkContext.game.debug.stopDebugging();
      }
    }
  }, [debugging]);

  useEffect(() => {
    if (gameApp) {
      gameApp.destroy(true);
    }
    if (active) {
      gameAppRef.current = new GameApp(DOM_ID, game, runner, control);
      setGameApp(gameAppRef.current);
      onInitialized();
    }
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
  }, [saveData, startTime, active]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (gameApp) {
      gameApp.controlScenes(control);
    }
  }, [control]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
      }}
    >
      <div
        ref={gameDivRef}
        id={DOM_ID}
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
        }}
      />
      <UI />
      {children}
    </div>
  );
};

export default Game;
