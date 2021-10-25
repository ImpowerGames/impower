import { MessageData } from "../types/interfaces/messageData";

const createMessageData = (
  doc?: Partial<MessageData> &
    Pick<MessageData, "fullName"> &
    Pick<MessageData, "email"> &
    Pick<MessageData, "message">
): MessageData => ({
  ...doc,
});

export default createMessageData;
