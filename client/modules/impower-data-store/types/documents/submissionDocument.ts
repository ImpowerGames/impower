import { CommentDocument } from "./commentDocument";
import { ContributionDocument } from "./contributionDocument";
import { PageDocument } from "./pageDocument";
import { PhraseDocument } from "./phraseDocument";
import { ProjectDocument } from "./projectDocument";
import { ReportDocument } from "./reportDocument";
import { SuggestionDocument } from "./suggestionDocument";
import { UserDocument } from "./userDocument";

export type SubmissionDocument =
  | PageDocument
  | ProjectDocument
  | PhraseDocument
  | SuggestionDocument
  | CommentDocument
  | ContributionDocument
  | ReportDocument
  | UserDocument;
