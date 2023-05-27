import { ContributionDocument } from "../types/documents/contributionDocument";

const isContributionDocument = (obj: unknown): obj is ContributionDocument => {
  if (!obj) {
    return false;
  }
  const doc = obj as ContributionDocument;
  return doc._documentType === "ContributionDocument";
};

export default isContributionDocument;
