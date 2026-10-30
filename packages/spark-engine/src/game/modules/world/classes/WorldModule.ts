import { Module } from "../../../core/classes/Module";
import {
  worldBuiltinDefinitions,
  type WorldBuiltins,
} from "../worldBuiltinDefinitions";
import {
  LoadWorldMessage,
  type LoadWorldMessageMap,
} from "./messages/LoadWorldMessage";

export interface WorldConfig {}

export interface WorldState {}

export type WorldMessageMap = LoadWorldMessageMap;

export class WorldModule extends Module<
  WorldState,
  WorldMessageMap,
  WorldBuiltins
> {
  loadWorld(name: string): Promise<unknown> {
    const src = this.context.world?.[name]?.src;
    if (src) {
      return this.emit(LoadWorldMessage.type.request({ src }));
    }
    return Promise.resolve();
  }

  override getBuiltins() {
    return worldBuiltinDefinitions();
  }

  override getStored() {
    return [];
  }
}
