import { GameTrigger } from "../../enums/GameTrigger";

export interface ImageRequestProps {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  duration: number;
  trigger?: GameTrigger;
}
