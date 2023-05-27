import { SlugDocument } from "../types/documents/slugDocument";

const createSlugDocument = (doc?: Partial<SlugDocument>): SlugDocument => ({
  _documentType: "SlugDocument",
  id: "",
  ...doc,
});

export default createSlugDocument;
