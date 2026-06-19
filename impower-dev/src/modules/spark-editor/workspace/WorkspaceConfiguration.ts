export default class WorkspaceConfiguration {
  protected _settings = {
    scriptFiles: "*.{sd}",
    imageFiles: "*.{png,apng,jpeg,jpg,gif,bmp,svg,webp}",
    audioFiles: "*.{mid,wav,mp3,mp2,ogg,aac,opus,flac}",
    videoFiles: "*.{mp4,webm,mov,m4v,ogv,mkv}",
    fontFiles: "*.{ttf,woff,woff2,otf}",
    worldFiles: "*.{js}",
  };
  get settings() {
    return this._settings;
  }
}
