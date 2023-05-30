import { ConfigReference } from "./configReference";

export interface SaveConfigReference extends ConfigReference<"SaveConfig"> {
  refTypeId: "SaveConfig";
  refId: "SaveConfig";
}
