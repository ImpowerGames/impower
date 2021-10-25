import { getLabel } from "../../../impower-config";
import ConfigCache from "../../../impower-config/classes/configCache";
import { getPropertyName, getValue, List } from "../../../impower-core";
import { GameDocument } from "../../types/documents/gameDocument";
import { DevelopmentStatus } from "../../types/enums/developmentStatus";
import { PitchGoal } from "../../types/enums/pitchGoal";
import createGameDocument from "../../utils/createGameDocument";
import { PageDocumentInspector } from "./pageDocumentInspector";

export class GameDocumentInspector extends PageDocumentInspector<GameDocument> {
  private static _instance: GameDocumentInspector;

  public static get instance(): GameDocumentInspector {
    if (!this._instance) {
      this._instance = new GameDocumentInspector();
    }
    return this._instance;
  }

  createData(data?: Partial<GameDocument>): GameDocument {
    return createGameDocument(data);
  }

  async getPropertyError(
    propertyPath: string,
    data: GameDocument,
    value: unknown,
    docIds: string[]
  ): Promise<string | null> {
    if (propertyPath === "tags") {
      if (
        data.pitched &&
        (!value || (Array.isArray(value) && value.length === 0))
      ) {
        return "Select at least one tag";
      }
    }
    return super.getPropertyError(propertyPath, data, value, docIds);
  }

  isPropertyDisplayValueInverted(
    propertyPath: string,
    _data: GameDocument
  ): boolean {
    if (propertyPath === "restricted") {
      return true;
    }
    return undefined;
  }

  isPropertyCollapsible(propertyPath: string, _data: GameDocument): boolean {
    if (propertyPath === "screenshots") {
      return false;
    }
    return undefined;
  }

  getPropertyLabel(propertyPath: string, data: GameDocument): string {
    if (propertyPath === "name") {
      return "Title";
    }
    if (propertyPath === "summary") {
      return "";
    }
    if (propertyPath === "status") {
      return "Development Status";
    }
    if (propertyPath.startsWith("screenshots.data.")) {
      const value = getValue<List>(data, "screenshots");
      const index = value.order.indexOf(getPropertyName(propertyPath));
      return `Screenshot ${index + 1}`;
    }
    if (propertyPath === "restricted") {
      return "All studio members can access this game";
    }
    if (propertyPath === "pitchGoal") {
      return "";
    }
    return super.getPropertyLabel(propertyPath, data);
  }

  getPropertyDisplayValue(
    propertyPath: string,
    data: GameDocument,
    value: unknown
  ): string {
    if (propertyPath === "status") {
      if (value !== undefined) {
        return getLabel(value as string);
      }
    }
    if (propertyPath === "pitchGoal") {
      if (value !== undefined) {
        return getLabel(value as string);
      }
    }
    return super.getPropertyDisplayValue(propertyPath, data, value);
  }

  getPropertyInputType(
    propertyPath: string,
    data?: GameDocument
  ):
    | "button"
    | "checkbox"
    | "color"
    | "date"
    | "datetime-local"
    | "email"
    | "file"
    | "hidden"
    | "image"
    | "month"
    | "number"
    | "password"
    | "radio"
    | "range"
    | "reset"
    | "search"
    | "submit"
    | "tel"
    | "text"
    | "time"
    | "url"
    | "week" {
    if (propertyPath === "pitchGoal") {
      return "radio";
    }
    return super.getPropertyInputType(propertyPath, data);
  }

  getPropertyOptions(propertyPath: string, data?: GameDocument): unknown[] {
    if (propertyPath === "status") {
      return Object.values(DevelopmentStatus);
    }
    if (propertyPath === "tags") {
      const gameTags = ConfigCache.instance.params?.gameTags;
      return Object.values(gameTags)
        .flatMap((categories) => categories.flatMap((groups) => groups).sort())
        .map((tag) => tag.toLowerCase());
    }
    if (propertyPath === "pitchGoal") {
      return Object.values(PitchGoal);
    }
    return super.getPropertyOptions(propertyPath, data);
  }

  getPropertyValueGroup(
    propertyPath: string,
    _data: GameDocument,
    value: string
  ): string {
    if (propertyPath === "tags") {
      const gameTags = ConfigCache.instance.params?.gameTags;
      if (
        gameTags.Mechanics.flatMap((groups) => groups)
          .map((tag) => tag.toLowerCase())
          .includes(value)
      ) {
        return "Mechanics";
      }
      if (
        gameTags.Genres.flatMap((groups) => groups)
          .map((tag) => tag.toLowerCase())
          .includes(value)
      ) {
        return "Genres";
      }
      if (
        gameTags.Aesthetics.flatMap((groups) => groups)
          .map((tag) => tag.toLowerCase())
          .includes(value)
      ) {
        return "Aesthetics";
      }
      if (
        gameTags.Subjects.flatMap((groups) => groups)
          .map((tag) => tag.toLowerCase())
          .includes(value)
      ) {
        return "Subjects";
      }
    }
    return undefined;
  }

  getPropertyValueDescription(
    propertyPath: string,
    _data: GameDocument,
    value: unknown
  ): string {
    if (propertyPath.endsWith("access")) {
      if (value === "owner") {
        return "Can delete and manage access to the game";
      }
      if (value === "editor") {
        return "Can edit the game project";
      }
      if (value === "viewer") {
        return "Can view & play the game";
      }
    }
    if (propertyPath.endsWith("pitchGoal")) {
      if (value === PitchGoal.Inspiration) {
        return "I'd love to play a game like this!";
      }
      if (value === PitchGoal.Collaboration) {
        return "I'd like to collaborate with others on this!";
      }
    }
    return undefined;
  }

  getPropertyValueIcon(
    propertyPath: string,
    data: GameDocument,
    value: unknown
  ): string {
    if (propertyPath.endsWith("pitchGoal")) {
      if (value === PitchGoal.Inspiration) {
        return "lightbulb-on";
      }
      if (value === PitchGoal.Collaboration) {
        return "handshake-simple";
      }
    }
    return super.getPropertyValueIcon(propertyPath, data, value);
  }

  getPropertyPlaceholder(propertyPath: string, data: GameDocument): string {
    if (propertyPath === "description") {
      return `Describe the game's story, features, controls, or anything else.`;
    }
    if (propertyPath === "summary") {
      const messages = ConfigCache.instance.params?.messages;
      return messages.pitched_games_preamble;
    }
    return super.getPropertyPlaceholder(propertyPath, data);
  }

  getPropertyHelperText(propertyPath: string, data: GameDocument): string {
    if (propertyPath === "tags" && !data?._createdAt && data.tags.length > 0) {
      return `Tap a tag to lock it in while randomizing.`;
    }
    if (propertyPath === "name" && !data?._createdAt) {
      return `Good titles work on multiple levels.`;
    }
    if (propertyPath === "summary" && !data?._createdAt) {
      return `Good pitches have a strong sense of irony.`;
    }
    return undefined;
  }

  getPropertyMoreInfoPopup(
    propertyPath: string,
    data: GameDocument
  ): {
    icon?: string;
    title?: string;
    description?: string;
    caption?: string;
    alignment?: "flex-start" | "center" | "flex-end";
  } {
    if (propertyPath === "summary" && !data?._createdAt) {
      return {
        icon: "info-circle",
        title: "What makes a good game pitch?",
        description: `1. It is short. 
2. It has a strong sense of irony.
3. It paints a compelling mental picture.
4. It clearly describes what the player will be doing (a.k.a. "The Core Gameplay Loop").
5. (And most importantly) The gameplay sounds fun or engaging!`,
        caption: `(Below are some examples of excellent game pitches from 'The Beginner's Guide')

- **Man Eating Beast**: A game where you are chased by a beast that's trying to eat you. Simultaneously, you are trying to eat the beast.

- **The Family Jewels**: A game where you play a queen dusting your jewelry while your kingdom is destroyed.

- **Captain's Orders**: A game where you live on a boat taking orders from the captain. The captain is always wrong.

- **Reality Check**: A game where you are paid to talk people down from pursuing their hopes and dreams.

- **Meat Market**: A game where you run a shop inside your body, selling your organs strategically to make the most money before you die.
`,
      };
    }
    return super.getPropertyMoreInfoPopup(propertyPath, data);
  }
}
