import { Ease } from "../../enums/ease";

export interface MoveImageRequestProps {
  id: string;
  ease: Ease;
  x: number;
  y: number;
  duration: number;
  additive: boolean;
}
