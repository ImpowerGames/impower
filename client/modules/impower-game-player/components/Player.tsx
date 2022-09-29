import dynamic from "next/dynamic";
import { PropsWithChildren } from "react";
import {
  GameProjectData,
  SaveData,
  SparkGame,
  SparkGameRunner,
} from "../../../../spark-engine";

const Game = dynamic(() => import("./Game"), { ssr: false });

interface PlayerProps {
  startTime: number;
  active: boolean;
  control: "Play" | "Pause";
  project: GameProjectData;
  debugging?: boolean;
  game?: SparkGame;
  runner?: SparkGameRunner;
  saveData?: SaveData;
  gameBucketFolderId?: string;
  logoSrc?: string;
  onInitialized: () => void;
  onCreateGame: (game?: SparkGame) => void;
}

export const Player = (props: PropsWithChildren<PlayerProps>): JSX.Element => {
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

  return (
    <Game
      startTime={startTime}
      active={active}
      control={control}
      project={project}
      debugging={debugging}
      game={game}
      runner={runner}
      saveData={saveData}
      logoSrc={logoSrc}
      onInitialized={onInitialized}
      onCreateGame={onCreateGame}
    >
      {children}
    </Game>
  );
};
