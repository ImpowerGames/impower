import { MemberAccess } from "../enums/memberAccess";
import { AggData } from "./aggData";

export interface MemberData extends AggData {
  g: "studios" | "projects";
  access: MemberAccess;
  role: string;
  accessedAt?: number;
}
