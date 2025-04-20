import { Module } from "../../../core/classes/Module";
import {
  worldBuiltinDefinitions,
  WorldBuiltins,
} from "../worldBuiltinDefinitions";
import {
  LoadWorldMessage,
  LoadWorldMessageMap,
} from "./messages/LoadWorldMessage";

export interface WorldConfig {}

export interface WorldState {}

export type WorldMessageMap = LoadWorldMessageMap;

export class WorldModule extends Module<
  WorldState,
  WorldMessageMap,
  WorldBuiltins
> {
  loadWorld(name: string) {
    const src = this.context.world?.[name]?.src;
    if (src) {
      this.emit(LoadWorldMessage.type.request({ src }));
    }
  }

  override getBuiltins() {
    return worldBuiltinDefinitions();
  }

  override getStored() {
    return [];
  }
}
