import { DelimiterType } from "../types/delimiterType";
import { Mark } from "../types/mark";

export class InlineDelimiter {
  readonly type: DelimiterType;

  readonly from: number;

  readonly to: number;

  public side: Mark;

  constructor(type: DelimiterType, from: number, to: number, side: Mark) {
    this.type = type;
    this.from = from;
    this.to = to;
    this.side = side;
  }
}
