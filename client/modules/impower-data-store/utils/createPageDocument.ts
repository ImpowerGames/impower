import { Timestamp } from "../../impower-core";
import { PageDocument } from "../types/documents/pageDocument";
import { Alignment } from "../types/enums/alignment";
import createAccessDocument from "./createAccessDocument";

const createPageDocument = (
  doc?: Partial<PageDocument> &
    Pick<PageDocument, "_documentType"> &
    Pick<PageDocument, "studio">
): PageDocument => {
  return {
    ...createAccessDocument(doc),
    published: false,
    publishedAt: new Timestamp(),
    republishedAt: new Timestamp(),
    name: "",
    summary: "",
    description: "",
    tags: [],
    icon: {
      storageKey: "",
      fileUrl: "",
      fileType: "image/png,image/jpeg",
      fileExtension: null,
    },
    cover: {
      storageKey: "",
      fileUrl: "",
      fileType: "image/png,image/jpeg",
      fileExtension: null,
    },
    logo: {
      storageKey: "",
      fileUrl: "",
      fileType: "image/png,image/jpeg",
      fileExtension: null,
    },
    hex: "#FFFFFF",
    backgroundHex: "#FFFFFF",
    logoAlignment: Alignment.MiddleCenter,
    delisted: false,
    patternScale: 1,
    status: "",
    statusInformation: "",
    score: 1,
    likes: 1,
    dislikes: 0,
    kudos: 0,
    ...doc,
  };
};

export default createPageDocument;
