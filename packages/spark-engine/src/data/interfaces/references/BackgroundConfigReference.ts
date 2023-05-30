import { ConfigReference } from "./ConfigReference";

export interface BackgroundConfigReference
  extends ConfigReference<"BackgroundConfig"> {
  refTypeId: "BackgroundConfig";
  refId: "BackgroundConfig";
}
