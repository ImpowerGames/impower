import { ContourType } from "./ContourType";
import { StressType } from "./StressType";

export interface Intonation extends Record<StressType, ContourType> {
  fluctuation: number;
}
