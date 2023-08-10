import { ConfigReference } from "./ConfigReference";

export interface SaveConfigReference extends ConfigReference<"SaveConfig"> {
  typeId: "SaveConfig";
  id: "SaveConfig";
}
