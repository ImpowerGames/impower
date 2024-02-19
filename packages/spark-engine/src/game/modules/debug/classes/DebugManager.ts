import { Manager } from "../../../core/classes/Manager";
import { LogData } from "../types/LogData";
import {
  DebugLogMessage,
  DebugLogMessageMap,
} from "./messages/DebugLogMessage";

export interface DebugConfig {}

export interface DebugState {
  logs?: LogData[];
}

export type DebugMessageMap = DebugLogMessageMap;

export class DebugManager extends Manager<DebugState, DebugMessageMap> {
  startDebugging(): void {
    this._context.system.debugging = true;
  }

  stopDebugging(): void {
    this._context.system.debugging = false;
  }

  log(data: LogData): void {
    this._state.logs ??= [];
    this._state.logs.push({ ...data });
    this.emit(DebugLogMessage.type.request(data));
  }
}
