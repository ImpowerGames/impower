import { StudioDocument } from "../types/documents/studioDocument";
import { DeveloperStatus } from "../types/enums/developerStatus";
import createPageDocument from "./createPageDocument";

const createStudioDocument = (
  doc?: Partial<StudioDocument>
): StudioDocument => ({
  ...createPageDocument(),
  handle: "",
  _documentType: "StudioDocument",
  neededRoles: [],
  changedMembers: { data: {} },
  status: DeveloperStatus.Active,
  ...doc,
});

export default createStudioDocument;
