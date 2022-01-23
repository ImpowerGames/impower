import { MemberAccess } from "../enums/memberAccess";
import { AggData } from "./aggData";

export interface MemberData extends AggData {
  g?: "studios" | "projects";
  access?: MemberAccess;
  role?: string;
  accessedAt?: number;
  /** studio */
  readonly s?: {
    id?: string;
    /** tags */
    tags?: string[];
    /** name */
    n?: string;
    /** unique name */
    u?: string;
    /** icon */
    i?: string;
    /** hex */
    h?: string;
  };
  /** project */
  readonly p?: {
    id?: string;
    /** tags */
    tags?: string[];
    /** name */
    n?: string;
    /** unique name */
    u?: string;
    /** icon */
    i?: string;
    /** hex */
    h?: string;
  };
}
