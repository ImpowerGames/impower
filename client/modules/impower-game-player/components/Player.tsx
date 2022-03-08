import dynamic from "next/dynamic";
import React, { PropsWithChildren } from "react";
import { GameProjectData } from "../../impower-game/data";
import { ImpowerGame, SaveData } from "../../impower-game/game";
import { ImpowerGameRunner } from "../../impower-game/runner";

const Game = dynamic(() => import("./Game"), { ssr: false });

interface PlayerProps {
  startTime: number;
  active: boolean;
  control: "Play" | "Pause";
  project: GameProjectData;
  game?: ImpowerGame;
  runner?: ImpowerGameRunner;
  saveData?: SaveData;
  gameBucketFolderId?: string;
  logoSrc?: string;
  onInitialized: () => void;
  onCreateGame: (game?: ImpowerGame) => void;
}

export const Player = (props: PropsWithChildren<PlayerProps>): JSX.Element => {
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

  return (
    <Game
      startTime={startTime}
      active={active}
      control={control}
      project={project}
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
