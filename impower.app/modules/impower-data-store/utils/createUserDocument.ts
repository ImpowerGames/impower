import { UserDocument } from "../types/documents/userDocument";

const createUserDocument = (
  doc?: Partial<UserDocument> & Pick<UserDocument, "username">
): UserDocument => ({
  _documentType: "UserDocument",
  username: "",
  bio: "",
  icon: {
    storageKey: "",
    fileUrl: "",
    fileType: "image/png,image/jpeg",
    fileExtension: null,
  },
  hex: "#FFFFFF",
  ...doc,
});

export default createUserDocument;
