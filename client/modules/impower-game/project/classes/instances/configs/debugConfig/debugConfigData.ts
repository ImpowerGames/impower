import { ConfigData } from "../../config/configData";

export interface DebugConfigData extends ConfigData<"DebugConfig"> {
  randomizationSeed: string;
  logBlockExecutions: boolean;
}
