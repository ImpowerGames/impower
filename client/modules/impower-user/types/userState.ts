import {
  CustomizationType,
  SettingsType,
  SubmissionType,
} from "../../impower-api";
import { UserAttributes, UserClaims } from "../../impower-auth";
import { DataDocument } from "../../impower-core";
import { AggData, MemberData } from "../../impower-data-state";
import {
  CommentDocument,
  ContributionDocument,
  CustomizationDocument,
  PageDocument,
  ProjectDocument,
  SettingsDocument,
  StudioDocument,
  UserDocument,
} from "../../impower-data-store";

export interface UserState extends UserAttributes {
  uid?: string;
  isSignedIn?: boolean;
  userDoc?: UserDocument;
  claims?: UserClaims;
  tempEmail?: string;
  tempUsername?: string;
  studios?: {
    [id: string]: StudioDocument;
  };
  submissions?: {
    [submissionType in SubmissionType]: DataDocument;
  };
  customizations?: {
    [customizationType in CustomizationType]: CustomizationDocument;
  };
  settings?: {
    [settingsType in SettingsType]: SettingsDocument;
  };
  follows?: {
    [uid: string]: AggData;
  };
  connects?: {
    [uid: string]: AggData;
  };
  my_submissions?: {
    [key: string]: AggData;
  };
  my_connects?: {
    [key: string]: AggData;
  };
  my_follows?: {
    [key: string]: AggData;
  };
  my_likes?: {
    [key: string]: AggData;
  };
  my_dislikes?: {
    [key: string]: AggData;
  };
  my_kudos?: {
    [key: string]: AggData;
  };
  my_reports?: {
    [key: string]: AggData;
  };
  my_studio_memberships?: {
    [docId: string]: MemberData;
  };
  my_project_memberships?: {
    [docId: string]: MemberData;
  };
  my_recent_pages?: {
    [docId: string]: PageDocument;
  };
  my_recent_published_pages?: {
    [docId: string]: PageDocument;
  };
  my_recent_pitched_projects?: {
    [docId: string]: ProjectDocument;
  };
  my_recent_comments?: {
    [parentDocId: string]: {
      [docId: string]: CommentDocument;
    };
  };
  my_recent_contributions?: {
    [parentDocId: string]: {
      [docId: string]: ContributionDocument;
    };
  };
  notifications?: {
    [key: string]: AggData;
  };
}
