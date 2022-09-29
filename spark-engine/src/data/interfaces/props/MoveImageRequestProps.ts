import { Ease } from "../../enums/Ease";

export interface MoveImageRequestProps {
  id: string;
  ease: Ease;
  x: number;
  y: number;
  duration: number;
  additive: boolean;
}
