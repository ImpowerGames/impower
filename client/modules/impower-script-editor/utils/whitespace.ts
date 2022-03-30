import { newline } from "./newline";
import { space } from "./space";
import { tab } from "./tab";

export const whitespace = (ch: number): boolean => {
  return space(ch) || tab(ch) || newline(ch);
};
