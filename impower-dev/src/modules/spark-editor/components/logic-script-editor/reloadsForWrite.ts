export interface AnnouncedWrite {
  text?: string;
  remote: boolean;
  origin?: string;
  restored: boolean;
}

export interface OpenScript {
  text?: string | null;
  stored: string | null;
  origin: string;
}

const holdsTyping = (script: OpenScript) =>
  script.text != null && script.text !== script.stored;

const restoresStored = (write: AnnouncedWrite, script: OpenScript) =>
  write.restored && write.text != null && write.text === script.stored;

export const reloadsForWrite = (write: AnnouncedWrite, script: OpenScript) => {
  if (restoresStored(write, script)) {
    return false;
  }
  if (write.remote && holdsTyping(script)) {
    return false;
  }
  const diverged =
    write.text != null && script.text != null && write.text !== script.text;
  return write.remote || (diverged && write.origin !== script.origin);
};

export const rewritesTypingAfter = (
  write: AnnouncedWrite,
  script: OpenScript,
) => write.remote && holdsTyping(script) && !restoresStored(write, script);

export const keepsTypingOver = (write: AnnouncedWrite, script: OpenScript) =>
  rewritesTypingAfter(write, script) &&
  write.text !== script.stored &&
  write.text !== script.text;
