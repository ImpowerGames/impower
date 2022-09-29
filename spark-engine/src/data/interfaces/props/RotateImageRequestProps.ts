import { Ease } from "../../enums/Ease";

export interface RotateImageRequestProps {
  id: string;
  ease: Ease;
  angle: number;
  duration: number;
  additive: boolean;
}
