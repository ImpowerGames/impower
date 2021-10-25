import { Ease } from "../../enums/ease";

export interface ScaleImageRequestProps {
  id: string;
  ease: Ease;
  x: number;
  y: number;
  duration: number;
  additive: boolean;
}
