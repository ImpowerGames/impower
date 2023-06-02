import { MemberAccess } from "../enums/memberAccess";
import { AggData } from "./aggData";
import { InfoAttributes } from "./infoAttributes";

export interface MemberData extends AggData {
  g?: "studios" | "projects";
  access?: MemberAccess;
  role?: string;
  accessedAt?: number;
  /** studio */
  readonly s?: InfoAttributes;
  /** project */
  readonly p?: InfoAttributes;
}
