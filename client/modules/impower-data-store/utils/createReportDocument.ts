import { createDataDocument } from "../../impower-core";
import { ReportDocument } from "../types/documents/reportDocument";
import { ReportReason } from "../types/enums/reportReason";

const createReportDocument = (
  doc?: Partial<ReportDocument>
): ReportDocument => ({
  ...createDataDocument(),
  _documentType: "ReportDocument",
  reason: ReportReason.Spam,
  content: "",
  ...doc,
});

export default createReportDocument;
