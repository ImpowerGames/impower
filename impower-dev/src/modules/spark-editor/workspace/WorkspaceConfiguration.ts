export default class WorkspaceConfiguration {
  protected _settings = {
    scriptFiles: ["*.sd", "*.spark", "*.sparkdown"],
    imageFiles: [
      "*.png",
      "*.apng",
      "*.jpeg",
      "*.jpg",
      "*.gif",
      "*.svg",
      "*.bmp",
    ],
    audioFiles: ["*.wav", "*.mp3", "*.mp4", "*.ogg"],
  };
  get settings() {
    return this._settings;
  }
}
