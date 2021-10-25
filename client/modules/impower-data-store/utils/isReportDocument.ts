import { ReportDocument } from "../types/documents/reportDocument";

const isReportDocument = (obj: unknown): obj is ReportDocument => {
  if (!obj) {
    return false;
  }
  const doc = obj as ReportDocument;
  return doc._documentType === "ReportDocument";
};

export default isReportDocument;
