export default class WorkspaceConfiguration {
  protected _settings = {
    scriptFiles: "*.{sparkdown,sd,script,project}",
    imageFiles: "*.{png,apng,jpeg,jpg,gif,bmp,svg}",
    audioFiles: "*.{mid,wav,mp3,ogg}",
    fontFiles: "*.{ttf,woff,woff2,otf}",
  };
  get settings() {
    return this._settings;
  }
}
