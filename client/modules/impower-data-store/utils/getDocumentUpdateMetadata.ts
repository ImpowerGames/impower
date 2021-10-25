import {
  incrementServerValue,
  timestampServerValue,
  UpdateData,
} from "../types/aliases";
import getToday from "./getToday";

const getDocumentUpdateMetadata = async (): Promise<UpdateData<unknown>> => {
  const Auth = (await import("../../impower-auth/classes/auth")).default;
  return {
    _author: Auth.instance.author,
    _updatedBy: Auth.instance.uid || "",
    _updatedAt: timestampServerValue(),
    [`_updates.${getToday()}`]: incrementServerValue(1),
  };
};

export default getDocumentUpdateMetadata;
