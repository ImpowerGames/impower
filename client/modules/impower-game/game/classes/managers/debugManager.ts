import { Manager } from "./manager";
import { GameEvent } from "../events/gameEvent";
import { LogData } from "../../interfaces/logData";

export interface DebugState {
  currentLogs: LogData[];
}

export interface DebugEvents {
  onLog: GameEvent<LogData>;
}

export class DebugManager extends Manager<DebugState, DebugEvents> {
  getInitialState(): DebugState {
    return { currentLogs: [] };
  }

  getInitialEvents(): DebugEvents {
    return { onLog: new GameEvent<LogData>() };
  }

  log(data: LogData): void {
    this.state.currentLogs.push({ ...data });
    this.events.onLog.emit({ ...data });
  }

  clearLogs(): void {
    this.state.currentLogs = [];
  }
}
