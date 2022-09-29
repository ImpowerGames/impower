import { ConfigData } from "../../config/ConfigData";

export interface DebugConfigData extends ConfigData<"DebugConfig"> {
  randomizationSeed: string;
  logBlockExecutions: boolean;
}
