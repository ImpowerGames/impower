import {
  SparkActionAssetToken,
  SparkActionToken,
  SparkAssetsToken,
  SparkAssignToken,
  SparkCallToken,
  SparkCenteredToken,
  SparkChoiceToken,
  SparkConditionToken,
  SparkDialogueAssetToken,
  SparkDialogueToken,
  SparkJumpToken,
  SparkLabelToken,
  SparkReturnToken,
  SparkSceneToken,
  SparkSectionToken,
  SparkStructFieldToken,
  SparkStructToken,
  SparkToken,
  SparkTransitionToken,
} from "./SparkToken";
import { SparkTokenType } from "./SparkTokenType";

export interface SparkTokenTypeMap extends Record<SparkTokenType, SparkToken> {
  "": SparkToken;
  comment: SparkToken;
  title: SparkToken;
  separator: SparkToken;
  label: SparkLabelToken;
  page_break: SparkToken;
  dialogue_asset: SparkDialogueAssetToken;
  action_asset: SparkActionAssetToken;
  dialogue_end: SparkToken;
  dual_dialogue_start: SparkToken;
  dual_dialogue_end: SparkToken;
  lyric: SparkToken;
  note: SparkToken;
  boneyard_start: SparkToken;
  boneyard_end: SparkToken;
  repeat: SparkToken;
  credit: SparkToken;
  author: SparkToken;
  authors: SparkToken;
  source: SparkToken;
  watermark: SparkToken;
  font: SparkToken;
  notes: SparkToken;
  copyright: SparkToken;
  revision: SparkToken;
  date: SparkToken;
  draft_date: SparkToken;
  contact: SparkToken;
  contact_info: SparkToken;
  dialogue_start: SparkToken;
  dialogue_character: SparkToken;
  dialogue_parenthetical: SparkToken;
  css: SparkToken;
  import: SparkToken;

  struct: SparkStructToken;

  struct_field: SparkStructFieldToken;

  centered: SparkCenteredToken;
  assign: SparkAssignToken;
  call: SparkCallToken;
  condition: SparkConditionToken;
  choice: SparkChoiceToken;
  jump: SparkJumpToken;
  return: SparkReturnToken;
  section: SparkSectionToken;
  scene: SparkSceneToken;
  dialogue: SparkDialogueToken;
  action: SparkActionToken;
  assets: SparkAssetsToken;
  transition: SparkTransitionToken;
}
