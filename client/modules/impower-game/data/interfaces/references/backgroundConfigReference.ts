import { ConfigReference } from "./configReference";

export interface BackgroundConfigReference
  extends ConfigReference<"BackgroundConfig"> {
  refTypeId: "BackgroundConfig";
  refId: "BackgroundConfig";
}
