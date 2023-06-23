export interface SparkSceneMetadata {
  scene: string | number;
  name: string;
  location: string;
  time: string;
  line: number;
  dialogueDuration?: number;
  actionDuration?: number;
}
