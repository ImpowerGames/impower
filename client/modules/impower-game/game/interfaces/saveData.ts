import { AssetState } from "../classes/managers/assetManager";
import { AudioState } from "../classes/managers/audioManager";
import { EntityState } from "../classes/managers/entityManager";
import { LogicState } from "../classes/managers/logicManager";
import { RandomState } from "../classes/managers/randomManager";

export interface SaveData {
  audio: AudioState;
  asset: AssetState;
  entity: EntityState;
  logic: LogicState;
  random: RandomState;
  custom: { [key: string]: unknown };
}
