export default class WorkspaceConfiguration {
  protected _settings = {
    scriptFiles: [".script", "*.sd", "*.spark", "*.sparkdown"],
    imageFiles: ["*.png", "*.svg"],
    audioFiles: ["*.mid", "*.wav", "*.mp3", "*.ogg"],
  };
  get settings() {
    return this._settings;
  }
}
