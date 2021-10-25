import { DataDocument } from "../../../impower-core";
import { ReportReason } from "../enums/reportReason";

export interface ReportDocument extends DataDocument<"ReportDocument"> {
  reason: ReportReason;
  content: string;
}
