import React from "react";
import { ImpowerGame } from "../../impower-game/game";

export const GameContext = React.createContext<{
  game?: ImpowerGame;
  onCreateGame: (game?: ImpowerGame) => void;
}>(undefined);
