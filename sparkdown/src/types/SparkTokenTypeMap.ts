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
  SparkEntityToken,
  SparkJumpToken,
  SparkReturnToken,
  SparkSceneToken,
  SparkSectionToken,
  SparkToken,
  SparkTransitionToken,
  SparkVariableToken,
} from "./SparkToken";

export interface SparkTokenTypeMap {
  "": SparkToken;
  comment: SparkToken;
  title: SparkToken;
  separator: SparkToken;
  synopsis: SparkToken;
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
  character: SparkToken;
  parenthetical: SparkToken;
  import: SparkToken;

  list: SparkEntityToken;
  map: SparkEntityToken;
  ui: SparkEntityToken;
  style: SparkEntityToken;
  config: SparkEntityToken;

  centered: SparkCenteredToken;
  variable: SparkVariableToken;
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
