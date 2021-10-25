import React from "react";
import { ImpowerGameRunner } from "../../impower-game/runner";

export const GameRunnerContext = React.createContext<{
  gameRunner: ImpowerGameRunner;
  onCreateRunner: (runner: ImpowerGameRunner) => void;
}>(undefined);
