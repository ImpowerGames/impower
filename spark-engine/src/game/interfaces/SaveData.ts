import { AssetState } from "../classes/managers/AssetManager";
import { AudioState } from "../classes/managers/AudioManager";
import { EntityState } from "../classes/managers/EntityManager";
import { LogicState } from "../classes/managers/LogicManager";
import { RandomState } from "../classes/managers/RandomManager";

export interface SaveData {
  audio: AudioState;
  asset: AssetState;
  entity: EntityState;
  logic: LogicState;
  random: RandomState;
  custom: { [key: string]: unknown };
}
