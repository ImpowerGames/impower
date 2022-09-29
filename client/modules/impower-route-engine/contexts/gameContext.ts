import React from "react";
import { SparkGame } from "../../../../spark-engine";

export const GameContext = React.createContext<{
  game?: SparkGame;
  onCreateGame: (game?: SparkGame) => void;
}>(undefined);
