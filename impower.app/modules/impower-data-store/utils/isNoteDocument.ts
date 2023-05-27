import { NoteDocument } from "../types/documents/noteDocument";

const isNoteDocument = (obj: unknown): obj is NoteDocument => {
  if (!obj) {
    return false;
  }
  const doc = obj as NoteDocument;
  return doc._documentType === "NoteDocument";
};

export default isNoteDocument;
