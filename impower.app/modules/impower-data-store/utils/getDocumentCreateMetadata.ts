import { timestampServerValue, UpdateData } from "../types/aliases";
import getToday from "./getToday";

const getDocumentCreateMetadata = async (): Promise<UpdateData<unknown>> => {
  const Auth = (await import("../../impower-auth/classes/auth")).default;
  return {
    _author: Auth.instance.author,
    _createdBy: Auth.instance.uid || "",
    _updatedBy: Auth.instance.uid || "",
    _createdAt: timestampServerValue(),
    _updatedAt: timestampServerValue(),
    _updates: {
      [`${getToday()}`]: 1,
    },
  };
};

export default getDocumentCreateMetadata;
