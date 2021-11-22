import { createDataDocument, Timestamp } from "../../impower-core";
import { ContributionDocument } from "../types/documents/contributionDocument";

const createContributionDocument = (
  doc?: Partial<ContributionDocument>
): ContributionDocument => ({
  ...createDataDocument(),
  _documentType: "ContributionDocument",
  _createdAt: new Timestamp(),
  content: "",
  contributionType: "story",
  backgroundHex: "",
  file: {
    storageKey: "",
  },
  waveform: [],
  aspectRatio: 1,
  square: true,
  crop: 0.5,
  deleted: false,
  delisted: false,
  score: 1,
  likes: 1,
  dislikes: 0,
  tags: [],
  ...doc,
});

export default createContributionDocument;
