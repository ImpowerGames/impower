import {
  PropsWithChildren,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import Measure from "react-measure";
import {
  getEntityObjects,
  getSectionAtLine,
  parseSpark,
} from "../../../../sparkdown";
import { getBlockTree } from "../../impower-game/data";
import { loadStyles, loadUI } from "../../impower-game/dom";
import { ImpowerGame, SaveData } from "../../impower-game/game";
import {
  getRuntimeBlocks,
  getScriptAugmentations,
} from "../../impower-game/parser";
import { GameProjectData } from "../../impower-game/project/classes/project/gameProjectData";
import { ImpowerGameRunner } from "../../impower-game/runner";
import { ProjectEngineContext } from "../../impower-route-engine/contexts/projectEngineContext";
import { useGameStyle } from "../hooks/gameHooks";
import { PhaserGame } from "../types/game/phaserGame";
import UI from "./UI";

const createGame = (
  project: GameProjectData,
  activeLine: number,
  debugging: boolean,
  isMobile: boolean,
  saveData?: SaveData
): ImpowerGame => {
  const script = project?.scripts?.data?.logic;
  const result = parseSpark(
    script,
    getScriptAugmentations(project?.files?.data),
    { lineOffset: 1 }
  );
  const runtimeBlocks = getRuntimeBlocks(result);
  const blockTree = getBlockTree(runtimeBlocks);
  const [defaultStartBlockId] = getSectionAtLine(activeLine, result);
  const startRuntimeBlock = runtimeBlocks?.[defaultStartBlockId];
  let defaultStartCommandIndex = 0;
  for (let i = 1; i < startRuntimeBlock?.commands?.order?.length || 0; i += 1) {
    const commandId = startRuntimeBlock.commands.order[i];
    const command = startRuntimeBlock.commands.data[commandId];
    if (command.line > activeLine) {
      break;
    } else {
      defaultStartCommandIndex = i;
    }
  }

  const game = new ImpowerGame(
    {
      defaultStartBlockId,
      defaultStartCommandIndex,
      seed: project?.instances?.configs?.data?.DebugConfig?.randomizationSeed,
      blockTree,
      debugging,
    },
    isMobile,
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
  game?: ImpowerGame;
  runner?: ImpowerGameRunner;
  saveData?: SaveData;
  logoSrc?: string;
  onInitialized: () => void;
  onCreateGame: (game?: ImpowerGame) => void;
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
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const gameDivRef = useRef<HTMLDivElement>(null);

  const gameStyle = useGameStyle(phaserGame);

  const [state] = useContext(ProjectEngineContext);
  const projectId = state?.project?.id;
  const activeLine = state?.panel?.panels?.logic?.cursor?.fromLine || 1;

  useEffect(() => {
    if (phaserGameRef.current) {
      if (debugging) {
        phaserGameRef.current.impowerGame.debug.startDebugging();
      } else {
        phaserGameRef.current.impowerGame.debug.stopDebugging();
      }
    }
  }, [debugging]);

  useEffect(() => {
    const setMobile = (): void => {
      setIsMobile(true);
    };

    if (isMobile) {
      window.removeEventListener("touchstart", setMobile);
    } else {
      window.addEventListener("touchstart", setMobile);
    }
  }, [isMobile]);

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
      const objectMap = getEntityObjects(result?.entities);
      loadStyles(objectMap, ...Object.keys(objectMap?.style || {}));
      loadUI(objectMap, ...Object.keys(objectMap?.ui || {}));
    }
  }, [script, files]);

  useEffect(() => {
    if (active) {
      const g = createGame(project, activeLine, debugging, isMobile, saveData);
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
      const g = createGame(project, activeLine, debugging, isMobile, saveData);
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
