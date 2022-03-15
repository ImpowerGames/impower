import { FountainEntityType } from "./FountainEntityType";

export interface FountainEntity {
  start: number;
  line: number;
  name: string;
  type: FountainEntityType;
  value: string;
  valueText: string;
}
