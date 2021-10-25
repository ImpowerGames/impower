import { MemberAccess } from "../enums/memberAccess";
import { AggData } from "./aggData";

export interface MemberData extends AggData {
  g: "studios" | "resources" | "games";
  access: MemberAccess;
  role: string;
  accessedAt?: number;
}
