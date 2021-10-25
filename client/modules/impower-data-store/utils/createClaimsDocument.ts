import { ClaimsDocument } from "../types/documents/claimsDocument";

const createClaimsDocument = (
  doc?: Partial<ClaimsDocument>
): ClaimsDocument => ({
  _documentType: "ClaimsDocument",
  ...doc,
});

export default createClaimsDocument;
