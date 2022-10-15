import { LogicState } from "../classes/managers/LogicManager";
import { RandomState } from "../classes/managers/RandomManager";
import { StructState } from "../classes/managers/StructManager";
import { SynthState } from "../classes/managers/SynthManager";
import { WorldState } from "../classes/managers/WorldManager";

export interface SaveData {
  synth: SynthState;
  struct: StructState;
  world: WorldState;
  logic: LogicState;
  random: RandomState;
  plugins: { [key: string]: unknown };
}
