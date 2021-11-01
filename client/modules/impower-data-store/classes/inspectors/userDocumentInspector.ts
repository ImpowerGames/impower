import { Inspector } from "../../../impower-core";
import { UserDocument } from "../../types/documents/userDocument";
import createUserDocument from "../../utils/createUserDocument";

export class UserDocumentInspector implements Inspector<UserDocument> {
  private static _instance: UserDocumentInspector;

  public static get instance(): UserDocumentInspector {
    if (!this._instance) {
      this._instance = new UserDocumentInspector();
    }
    return this._instance;
  }

  createData(
    data?: Partial<UserDocument> & Pick<UserDocument, "username">
  ): UserDocument {
    return createUserDocument(data);
  }

  getPropertyCharacterCountLimit(
    propertyPath: string,
    _data: UserDocument
  ): number {
    if (propertyPath === "bio") {
      return 300;
    }
    return undefined;
  }

  isPropertyCharacterCounterVisible(
    propertyPath: string,
    _data: UserDocument
  ): boolean {
    if (propertyPath === "bio") {
      return true;
    }
    return undefined;
  }

  isPropertyMultiline(propertyPath: string, _data: UserDocument): boolean {
    if (propertyPath === "bio") {
      return true;
    }
    return undefined;
  }
}
