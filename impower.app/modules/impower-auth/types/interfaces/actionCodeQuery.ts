import { ActionCodeMode } from "../aliases";

export interface ActionCodeQuery {
  mode: ActionCodeMode;
  oobCode: string;
  apiKey: string;
  continueUrl: string;
  lang: string;
}
