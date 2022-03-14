import { FountainEntityType } from "./FountainEntityType";

export interface FountainEntity {
  start: number;
  line: number;
  type: FountainEntityType;
  value: string;
}
