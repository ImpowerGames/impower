import { ContourType } from "./ContourType";
import { StressType } from "./StressType";

export interface Intonation extends Partial<Record<StressType, ContourType>> {}
