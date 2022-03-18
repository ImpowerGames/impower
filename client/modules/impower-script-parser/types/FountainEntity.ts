import { FountainEntityType } from "./FountainEntityType";

export interface FountainEntity {
  from: number;
  to: number;
  line: number;
  name: string;
  type: FountainEntityType;
  value: string;
  valueText: string;
}
