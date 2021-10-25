import Phaser from "phaser";

export const SPLASH_SCENE_KEY = "PhaserSplashScene";

export class PhaserSplashScene extends Phaser.Scene {
  logoUrl: string;

  width?: number;

  height?: number;

  logo?: Phaser.GameObjects.Image;

  logoTween?: Phaser.Tweens.Tween;

  constructor(
    config: string | Phaser.Types.Scenes.SettingsConfig,
    logoUrl: string
  ) {
    super(config);
    this.logoUrl = logoUrl;
  }

  createLogoTween(): void {
    if (this.height) {
      if (this.logoTween) {
        this.tweens.remove(this.logoTween);
      }
      this.logoTween = this.tweens.add({
        targets: this.logo,
        duration: 1000,
        ease: "Sine.inOut",
        yoyo: true,
        repeat: -1,
        y: this.height * 0.5 - 100,
      });
    }
  }

  preload(): void {
    this.load.svg("logo", this.logoUrl, { scale: 2.8 });
  }

  create(): void {
    this.width = this.game.scale.width;
    this.height = this.game.scale.height;
    this.logo = this.add.image(this.width * 0.5, this.height * 0.5, "logo");
    this.createLogoTween();
  }

  update(): void {
    if (
      this.width !== this.game.scale.width ||
      this.height !== this.game.scale.height
    ) {
      this.width = this.game.scale.width;
      this.height = this.game.scale.height;
      if (this.logo) {
        this.logo.setPosition(this.width * 0.5, this.height * 0.5);
      }
      this.createLogoTween();
    }
  }
}
