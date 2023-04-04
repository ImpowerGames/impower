import React from "react";
import { GameEvent } from "../../../../spark-engine";

export interface DataEvents {
  onOpenData: GameEvent<string>;
  onFocusData: GameEvent<string[], boolean>;
}

export interface DataContextState {
  events: DataEvents;
}

export const createDataContextState = (): DataContextState => ({
  events: {
    onOpenData: new GameEvent<string>(),
    onFocusData: new GameEvent<string[], boolean>(),
  },
});

export const DataContext = React.createContext<DataContextState>(undefined);
