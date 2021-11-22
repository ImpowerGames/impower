import { DataDocument, StorageFile } from "../../../impower-core";
import { ContributionType } from "../enums/contributionType";

export interface ContributionDocument
  extends DataDocument<"ContributionDocument"> {
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

  readonly delisted?: boolean;
  readonly removed?: boolean;

  readonly mentions?: string[];
}
