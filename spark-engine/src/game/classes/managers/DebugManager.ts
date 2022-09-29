import { LogData } from "../../interfaces/LogData";
import { GameEvent } from "../GameEvent";
import { Manager } from "../Manager";

export interface DebugState {
  currentLogs: LogData[];
  debugging?: boolean;
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

  startDebugging(): void {
    this.state.debugging = true;
  }

  stopDebugging(): void {
    this.state.debugging = false;
  }

  log(data: LogData): void {
    this.state.currentLogs.push({ ...data });
    this.events.onLog.emit({ ...data });
  }

  clearLogs(): void {
    this.state.currentLogs = [];
  }
}
