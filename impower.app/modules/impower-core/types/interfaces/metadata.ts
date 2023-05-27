import { AuthorAttributes } from "../../../impower-auth";
import { Timestamp } from "./timestamp";

export interface Metadata {
  _author?: AuthorAttributes;
  _createdBy?: string;
  _updatedBy?: string;
  _createdAt?: string | Timestamp;
  _updatedAt?: string | Timestamp;
  _updates?: { [day: string]: number };
}
