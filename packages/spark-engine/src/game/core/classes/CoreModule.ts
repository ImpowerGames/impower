import { CoreBuiltins, coreBuiltins } from "../coreBuiltins";
import { Module } from "./Module";

export interface CoreConfig {}

export interface CoreState {}

export type CoreMessageMap = {};

export class CoreModule extends Module<
  CoreState,
  CoreMessageMap,
  CoreBuiltins
> {
  override getBuiltins() {
    return coreBuiltins();
  }

  override getStored() {
    return [];
  }
}
