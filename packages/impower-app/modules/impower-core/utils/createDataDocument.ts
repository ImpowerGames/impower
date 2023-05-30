import { DataDocument } from "../types/interfaces/dataDocument";

const createDataDocument = (
  obj?: Partial<DataDocument> & Pick<DataDocument, "_documentType">
): DataDocument => ({
  ...obj,
});

export default createDataDocument;
