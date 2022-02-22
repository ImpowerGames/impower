import React, {
  PropsWithChildren,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import Measure from "react-measure";
import { getBlockTree } from "../../impower-game/data";
import { ImpowerGame, SaveData } from "../../impower-game/game";
import { getRuntimeBlocks } from "../../impower-game/parser";
import { GameProjectData } from "../../impower-game/project/classes/project/gameProjectData";
import { ImpowerGameRunner } from "../../impower-game/runner";
import { ProjectEngineContext } from "../../impower-route-engine/contexts/projectEngineContext";
import { parseFountain } from "../../impower-script-parser";
import { useGameStyle } from "../hooks/gameHooks";
import { Control } from "../types/control";
import { PhaserGame } from "../types/game/phaserGame";
import UI from "./UI";

const createGame = (
  project: GameProjectData,
  activeLine: number,
  isMobile: boolean,
  saveData?: SaveData
): ImpowerGame => {
  const script = project?.scripts?.logic?.data?.root;
  const result = parseFountain(script);
  const sections = result?.sections || {};
  const runtimeBlocks = getRuntimeBlocks(sections);
  const blockTree = getBlockTree(runtimeBlocks);
  const sectionEntries = Object.entries(sections);
  let defaultStartBlockId = sectionEntries[1]?.[0] || "";
  for (let i = 1; i < sectionEntries.length; i += 1) {
    const [id, section] = sectionEntries[i];
    if (id) {
      if (section.line <= activeLine) {
        defaultStartBlockId = id;
      } else {
        break;
      }
    }
  }
  const game = new ImpowerGame(
    {
      defaultStartBlockId,
      seed: project?.instances?.configs?.data?.DebugConfig?.randomizationSeed,
      blockTree,
    },
    isMobile,
    saveData
  );
  return game;
};

interface GameProps {
  startTime: number;
  active: boolean;
  control: Control;
  project: GameProjectData;
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
    game,
    runner,
    saveData,
    logoSrc,
    children,
    onInitialized,
    onCreateGame,
  } = props;

  const [phaserGame, setPhaserGame] = useState<PhaserGame>();
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const gameDivRef = useRef<HTMLDivElement>(null);

  const gameStyle = useGameStyle(phaserGame);

  const [engineState] = useContext(ProjectEngineContext);
  const projectId = engineState.present.project.id;
  const activeLine =
    engineState.present.dataPanel?.panels?.Logic?.Container?.cursor?.fromLine ||
    1;

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
      setPhaserGame(
        new PhaserGame(project, projectId, game, runner, control, logoSrc)
      );
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

  useEffect(() => {
    if (active) {
      const g = createGame(project, activeLine, isMobile, saveData);
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
        setPhaserGame(
          new PhaserGame(project, projectId, game, runner, control, logoSrc)
        );
        onInitialized();
      }
      phaserGame.updateProject(project);
    }
  }, [project, runner]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (active) {
      const g = createGame(project, activeLine, isMobile, saveData);
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
          {phaserGame && <UI phaserGame={phaserGame} />}
          {children}
        </div>
      )}
    </Measure>
  );
};

export default Game;
