import React from "react";
import { SparkGameRunner } from "../../../../spark-engine";

export const GameRunnerContext = React.createContext<{
  gameRunner: SparkGameRunner;
  onCreateRunner: (runner: SparkGameRunner) => void;
}>(undefined);
