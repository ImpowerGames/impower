import { ConfigReference } from "./ConfigReference";

export interface BackgroundConfigReference
  extends ConfigReference<"BackgroundConfig"> {
  typeId: "BackgroundConfig";
  id: "BackgroundConfig";
}
