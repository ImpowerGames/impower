import {
  SparkActionAssetToken,
  SparkActionToken,
  SparkAssetsToken,
  SparkAssetToken,
  SparkCallToken,
  SparkCenteredToken,
  SparkChoiceToken,
  SparkConditionToken,
  SparkDialogueAssetToken,
  SparkDialogueToken,
  SparkEntityToken,
  SparkGoToken,
  SparkReturnToken,
  SparkSceneToken,
  SparkSectionToken,
  SparkTagToken,
  SparkToken,
  SparkTransitionToken,
  SparkVariableToken,
} from "./SparkToken";

export interface SparkTokenTypeMap {
  "": SparkToken;
  "comment": SparkToken;
  "title": SparkToken;
  "separator": SparkToken;
  "synopses": SparkToken;
  "page_break": SparkToken;
  "dialogue_asset": SparkDialogueAssetToken;
  "action_asset": SparkActionAssetToken;
  "dialogue_end": SparkToken;
  "dual_dialogue_start": SparkToken;
  "dual_dialogue_end": SparkToken;
  "lyric": SparkToken;
  "note": SparkToken;
  "boneyard_start": SparkToken;
  "boneyard_end": SparkToken;
  "repeat": SparkToken;
  "credit": SparkToken;
  "author": SparkToken;
  "authors": SparkToken;
  "source": SparkToken;
  "watermark": SparkToken;
  "font": SparkToken;
  "notes": SparkToken;
  "copyright": SparkToken;
  "revision": SparkToken;
  "date": SparkToken;
  "draft_date": SparkToken;
  "contact": SparkToken;
  "contact_info": SparkToken;
  "dialogue_start": SparkToken;
  "character": SparkToken;
  "parenthetical": SparkToken;

  "image": SparkAssetToken;
  "audio": SparkAssetToken;
  "video": SparkAssetToken;
  "text": SparkAssetToken;

  "list": SparkEntityToken;
  "map": SparkEntityToken;
  "ui": SparkEntityToken;
  "style": SparkEntityToken;
  "config": SparkEntityToken;

  "centered": SparkCenteredToken;
  "tag": SparkTagToken;
  "variable": SparkVariableToken;
  "assign": SparkAssetToken;
  "call": SparkCallToken;
  "condition": SparkConditionToken;
  "choice": SparkChoiceToken;
  "go": SparkGoToken;
  "return": SparkReturnToken;
  "section": SparkSectionToken;
  "scene": SparkSceneToken;
  "dialogue": SparkDialogueToken;
  "action": SparkActionToken;
  "assets": SparkAssetsToken;
  "transition": SparkTransitionToken;
}
