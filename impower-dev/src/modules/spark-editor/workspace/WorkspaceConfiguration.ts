export default class WorkspaceConfiguration {
  protected _settings = {
    scriptFiles: "*.{sparkdown,sd,script,project}",
    imageFiles: "*.{png,apng,jpeg,jpg,gif,bmp,svg}",
    audioFiles: "*.{mid,wav,mp3,ogg}",
  };
  get settings() {
    return this._settings;
  }
}
