import React from "react";
import { ImpowerGameInspector } from "../../impower-game/inspector";

export const GameInspectorContext = React.createContext<{
  gameInspector: ImpowerGameInspector;
  onCreateInspector: (inspector: ImpowerGameInspector) => void;
}>(undefined);
