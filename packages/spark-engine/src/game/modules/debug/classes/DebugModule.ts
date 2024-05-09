import { Module } from "../../../core/classes/Module";
import { DebugBuiltins, debugBuiltins } from "../debugBuiltins";
import { debugCommands } from "../debugCommands";
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

export class DebugModule extends Module<
  DebugState,
  DebugMessageMap,
  DebugBuiltins
> {
  override getBuiltins() {
    return debugBuiltins();
  }

  override getStored() {
    return [];
  }

  override getCommands() {
    return debugCommands(this._game);
  }

  startDebugging(): void {
    this.context.system.debugging = true;
  }

  stopDebugging(): void {
    this.context.system.debugging = false;
  }

  log(data: LogData): void {
    this._state.logs ??= [];
    this._state.logs.push({ ...data });
    this.emit(DebugLogMessage.type.request(data));
  }
}
