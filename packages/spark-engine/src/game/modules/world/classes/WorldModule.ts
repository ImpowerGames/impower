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
  /** Resolves once the page has fetched, instantiated, and mounted the world,
   *  so a `load` beat can hold its loading layout until then. Resolves at once
   *  for a name with no world source. */
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
