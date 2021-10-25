import { AssetState } from "../classes/managers/assetManager";
import { EntityState } from "../classes/managers/entityManager";
import { LogicState } from "../classes/managers/logicManager";
import { RandomState } from "../classes/managers/randomManager";

export interface SaveData {
  asset: AssetState;
  entity: EntityState;
  logic: LogicState;
  random: RandomState;
  custom: { [key: string]: unknown };
}
