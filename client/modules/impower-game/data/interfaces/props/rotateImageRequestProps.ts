import { Ease } from "../../enums/ease";

export interface RotateImageRequestProps {
  id: string;
  ease: Ease;
  angle: number;
  duration: number;
  additive: boolean;
}
