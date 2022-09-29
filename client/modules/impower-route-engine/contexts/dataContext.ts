import React from "react";
import { GameEvent } from "../../../../spark-engine";

export interface DataEvents {
  onOpenData: GameEvent<{ id: string }>;
  onFocusData: GameEvent<{ ids: string[]; instant?: boolean }>;
}

export interface DataContextState {
  events: DataEvents;
}

export const createDataContextState = (): DataContextState => ({
  events: {
    onOpenData: new GameEvent<{ id: string }>(),
    onFocusData: new GameEvent<{ ids: string[]; instant?: boolean }>(),
  },
});

export const DataContext = React.createContext<DataContextState>(undefined);
