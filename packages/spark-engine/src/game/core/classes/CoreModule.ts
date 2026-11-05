import type { CoreBuiltins } from "../types/CoreBuiltins";
import { Module } from "./Module";

export interface CoreConfig {}

export interface CoreState {}

export type CoreMessageMap = {};

export class CoreModule extends Module<
  CoreState,
  CoreMessageMap,
  CoreBuiltins
> {
  override getStored() {
    return [];
  }
}
