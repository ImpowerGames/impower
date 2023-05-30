import { DataDocument, StorageFile } from "../../../impower-core";
import { ContributionType } from "../enums/contributionType";
import { FlaggableDocument } from "./flaggableDocument";

export interface ContributionDocument
  extends DataDocument<"ContributionDocument">,
    FlaggableDocument {
  contributionType: ContributionType;
  content: string;
  backgroundHex: string;
  file: StorageFile;
  waveform: number[];
  aspectRatio: number;
  square?: boolean;
  crop: number;
  tags: string[];
  deleted: boolean;

  score?: number;
  likes?: number;
  dislikes?: number;

  kudos?: number;

  readonly rank?: number;
  readonly rating?: number;

  readonly mentions?: string[];
}
