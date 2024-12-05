export default class WorkspaceConfiguration {
  protected _settings = {
    scriptFiles: "*.{sparkdown,sd,script,project}",
    imageFiles: "*.{png,apng,jpeg,jpg,gif,bmp,svg,webp}",
    audioFiles: "*.{mid,wav,mp3,mp2,ogg,aac,opus,flac}",
    fontFiles: "*.{ttf,woff,woff2,otf}",
  };
  get settings() {
    return this._settings;
  }
}
