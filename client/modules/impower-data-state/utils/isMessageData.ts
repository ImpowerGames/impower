import { MessageData } from "../types/interfaces/messageData";

const isMessageData = (obj: unknown): obj is MessageData => {
  if (!obj) {
    return false;
  }
  const doc = obj as MessageData;
  return (
    doc.fullName !== undefined &&
    doc.email !== undefined &&
    doc.message !== undefined
  );
};

export default isMessageData;
