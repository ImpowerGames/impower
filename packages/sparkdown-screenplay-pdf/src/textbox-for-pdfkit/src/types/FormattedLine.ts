import { FormattedText } from "./FormattedText";

export interface FormattedLine {
  texts: FormattedText[];
  width: number;
  lineHeight?: number;
  align?: string;
}
