import { AssetState } from "../classes/managers/AssetManager";
import { AudioState } from "../classes/managers/AudioManager";
import { EntityState } from "../classes/managers/EntityManager";
import { LogicState } from "../classes/managers/LogicManager";
import { RandomState } from "../classes/managers/RandomManager";
import { StructState } from "../classes/managers/StructManager";

export interface SaveData {
  audio: AudioState;
  asset: AssetState;
  struct: StructState;
  entity: EntityState;
  logic: LogicState;
  random: RandomState;
  custom: { [key: string]: unknown };
}
