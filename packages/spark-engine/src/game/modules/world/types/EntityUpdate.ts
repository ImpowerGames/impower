import { RecursivePartial } from "../../../core/types/RecursivePartial";
import { EntityState } from "./EntityState";

export interface EntityUpdate extends RecursivePartial<EntityState> {
  id: string;
  camera?: string;
}
