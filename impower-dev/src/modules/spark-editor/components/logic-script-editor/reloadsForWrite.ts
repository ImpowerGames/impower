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

export const reloadsForWrite = (write: AnnouncedWrite, script: OpenScript) => {
  if (write.restored && write.text != null && write.text === script.stored) {
    return false;
  }
  const diverged =
    write.text != null && script.text != null && write.text !== script.text;
  return write.remote || (diverged && write.origin !== script.origin);
};
