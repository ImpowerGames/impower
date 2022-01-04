import { getLabel, getTagsSortedBySpecificity } from "../../../impower-config";
import ConfigCache from "../../../impower-config/classes/configCache";
import format from "../../../impower-config/utils/format";
import { getPropertyName, getValue, List } from "../../../impower-core";
import { ProjectDocument } from "../../types/documents/projectDocument";
import { DevelopmentStatus } from "../../types/enums/developmentStatus";
import { PitchGoal } from "../../types/enums/pitchGoal";
import createProjectDocument from "../../utils/createProjectDocument";
import { PageDocumentInspector } from "./pageDocumentInspector";

export class ProjectDocumentInspector extends PageDocumentInspector<ProjectDocument> {
  private static _instance: ProjectDocumentInspector;

  public static get instance(): ProjectDocumentInspector {
    if (!this._instance) {
      this._instance = new ProjectDocumentInspector();
    }
    return this._instance;
  }

  createData(data?: Partial<ProjectDocument>): ProjectDocument {
    return createProjectDocument(data);
  }

  async getPropertyError(
    propertyPath: string,
    data: ProjectDocument,
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
    _data: ProjectDocument
  ): boolean {
    if (propertyPath === "restricted") {
      return true;
    }
    return undefined;
  }

  isPropertyCollapsible(propertyPath: string, _data: ProjectDocument): boolean {
    if (propertyPath === "screenshots") {
      return false;
    }
    return undefined;
  }

  getPropertyMinRowCount(propertyPath: string, _data: ProjectDocument): number {
    if (propertyPath === "tags") {
      return 2;
    }
    return undefined;
  }

  getPropertyLabel(propertyPath: string, data: ProjectDocument): string {
    if (propertyPath === "name") {
      if (data?.projectType === "game" || data?.projectType === "story") {
        return "Title";
      }
    }
    if (propertyPath === "summary") {
      if (data?.projectType === "game" || data?.projectType === "environment") {
        return "Description";
      }
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
      return "All studio members can access this";
    }
    if (propertyPath === "pitchGoal") {
      return "";
    }
    return super.getPropertyLabel(propertyPath, data);
  }

  getPropertyDisplayValue(
    propertyPath: string,
    data: ProjectDocument,
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
    data?: ProjectDocument
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

  getPropertyOptions(propertyPath: string, data?: ProjectDocument): unknown[] {
    if (propertyPath === "status") {
      return Object.values(DevelopmentStatus);
    }
    if (propertyPath === "tags") {
      const gameTags = ConfigCache.instance.params?.projectTags;
      const resourceTags = ConfigCache.instance.params?.resourceTags;
      const roleTags = ConfigCache.instance.params?.roleTags;
      const moods = ConfigCache.instance.params?.moods;
      const archetypes = ConfigCache.instance.params?.archetypes;
      if (data?.projectType === "game") {
        return Object.values(gameTags)
          .flatMap((list) => list.flatMap((groups) => groups).sort())
          .map((tag) => tag.toLowerCase());
      }
      if (data?.projectType === "story") {
        return Object.entries(gameTags)
          .flatMap(([category, list]) => {
            if (category === "Mechanics") {
              return [];
            }
            if (category === "Subjects") {
              return [
                ...list.flatMap((groups) => groups),
                ...gameTags.Mechanics[0],
              ].sort();
            }
            return list.flatMap((groups) => groups).sort();
          })
          .map((tag) => tag.toLowerCase());
      }
      if (data?.projectType === "character" || data?.projectType === "voice") {
        return [
          ...(moods
            ? Object.values(moods).flatMap((x) => x.flatMap((y) => y))
            : []),
          ...(archetypes || []),
        ].map((tag) => tag.toLowerCase());
      }
      return [
        ...Object.values(gameTags)
          .flatMap((list) => list.flatMap((groups) => groups).sort())
          .map((tag) => tag.toLowerCase()),
        ...Object.values(resourceTags).flatMap((list) =>
          list.flatMap((groups) => groups)
        ),
        ...Object.values(roleTags).flatMap((list) =>
          list.flatMap((groups) => groups)
        ),
      ];
    }
    if (propertyPath === "pitchGoal") {
      return Object.values(PitchGoal);
    }
    return super.getPropertyOptions(propertyPath, data);
  }

  getPropertyValueGroup(
    propertyPath: string,
    data: ProjectDocument,
    value: string
  ): string {
    if (propertyPath === "tags") {
      if (data?.projectType === "character" || data?.projectType === "voice") {
        const moods = ConfigCache.instance.params?.moods;
        const archetypes = ConfigCache.instance.params?.archetypes;
        if (
          moods &&
          Object.values(moods)
            .flatMap((x) => x.flatMap((y) => y))
            .map((tag) => tag.toLowerCase())
            .includes(value)
        ) {
          return "Traits";
        }
        if (
          archetypes &&
          archetypes.map((tag) => tag.toLowerCase()).includes(value)
        ) {
          return "Archetypes";
        }
      }
      if (data?.projectType === "story") {
        const gameTags = ConfigCache.instance.params?.projectTags;
        if (
          gameTags.Mechanics.flatMap((groups) => groups)
            .map((tag) => tag.toLowerCase())
            .includes(value)
        ) {
          return "Subjects";
        }
      }
      const gameTags = ConfigCache.instance.params?.projectTags;
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
      const moods = ConfigCache.instance.params?.moods;
      const archetypes = ConfigCache.instance.params?.archetypes;
      if (
        moods &&
        Object.values(moods)
          .flatMap((x) => x.flatMap((y) => y))
          .map((tag) => tag.toLowerCase())
          .includes(value)
      ) {
        return "Traits";
      }
      if (
        archetypes &&
        archetypes.map((tag) => tag.toLowerCase()).includes(value)
      ) {
        return "Archetypes";
      }
      const locations = ConfigCache.instance.params?.locations;
      const atmospheres = ConfigCache.instance.params?.atmospheres;
      if (locations.map((tag) => tag.toLowerCase()).includes(value)) {
        return "Locations";
      }
      if (atmospheres.map((tag) => tag.toLowerCase()).includes(value)) {
        return "Atmosphere";
      }
      const visualStyles = ConfigCache.instance.params?.visualStyles;
      const musicalStyles = ConfigCache.instance.params?.musicalStyles;
      if (visualStyles.map((tag) => tag.toLowerCase()).includes(value)) {
        return "Visual Styles";
      }
      if (musicalStyles.map((tag) => tag.toLowerCase()).includes(value)) {
        return "Musical Styles";
      }
    }
    return undefined;
  }

  getPropertyValueDescription(
    propertyPath: string,
    _data: ProjectDocument,
    value: unknown
  ): string {
    if (propertyPath.endsWith("access")) {
      if (value === "owner") {
        return "Can delete and manage access";
      }
      if (value === "editor") {
        return "Can edit the project";
      }
      if (value === "viewer") {
        return "Can view the project";
      }
    }
    if (propertyPath.endsWith("pitchGoal")) {
      if (value === PitchGoal.Inspiration) {
        return "I'd love if someone made this!";
      }
      if (value === PitchGoal.Collaboration) {
        return "I'd like to collaborate with others on this!";
      }
    }
    return undefined;
  }

  getPropertyValueIcon(
    propertyPath: string,
    data: ProjectDocument,
    value: string
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

  getPropertyPlaceholder(propertyPath: string, data: ProjectDocument): string {
    if (propertyPath === "description") {
      return `Describe the game's story, features, controls, or anything else.`;
    }
    if (propertyPath === "summary") {
      if (data?.projectType === "game") {
        return `{tag:regex:A} {tag} game where you`;
      }
      if (data?.projectType === "character") {
        const archetypes = ConfigCache.instance.params?.archetypes;
        const mainTag = data?.tags?.[0];
        const sortedTags = getTagsSortedBySpecificity(data?.tags);
        const description = sortedTags
          .map((x) => (x === mainTag ? `{tag}` : x))
          .join(" ");
        if (archetypes?.includes(sortedTags?.[sortedTags.length - 1])) {
          return format(`{firstTag:regex:A} ${description} who`, {
            tag: "{tag}",
            firstTag: sortedTags?.[0],
          });
        }
        return format(`{firstTag:regex:A} ${description} character who`, {
          tag: "{tag}",
          firstTag: sortedTags?.[0],
        });
      }
      if (data?.projectType === "voice") {
        const archetypes = ConfigCache.instance.params?.archetypes;
        const mainTag = data?.tags?.[0];
        const sortedTags = getTagsSortedBySpecificity(data?.tags);
        const description = sortedTags
          .map((x) => (x === mainTag ? `{tag}` : x))
          .join(" ");
        if (archetypes?.includes(sortedTags?.[sortedTags.length - 1])) {
          return format(`{firstTag:regex:A} ${description} who says`, {
            tag: "{tag}",
            firstTag: sortedTags?.[0],
          });
        }
        return format(`{firstTag:regex:A} ${description} character who says`, {
          tag: "{tag}",
          firstTag: sortedTags?.[0],
        });
      }
      if (data?.projectType === "environment") {
        const locations = ConfigCache.instance.params?.locations;
        const mainTag = data?.tags?.[0];
        const sortedTags = getTagsSortedBySpecificity(data?.tags);
        const description = sortedTags
          .map((x) => (x === mainTag ? `{tag}` : x))
          .join(" ");
        if (locations?.includes(sortedTags?.[sortedTags.length - 1])) {
          return format(`{firstTag:regex:A} ${description} where`, {
            tag: "{tag}",
            firstTag: sortedTags?.[0],
          });
        }
        return format(`{firstTag:regex:A} ${description} environment where`, {
          tag: "{tag}",
          firstTag: sortedTags?.[0],
        });
      }
      if (data?.projectType === "sound") {
        const locations = ConfigCache.instance.params?.locations;
        const mainTag = data?.tags?.[0];
        const sortedTags = getTagsSortedBySpecificity(data?.tags);
        const description = sortedTags
          .map((x) => (x === mainTag ? `{tag}` : x))
          .join(" ");
        if (locations?.includes(sortedTags?.[sortedTags.length - 1])) {
          return format(`{firstTag:regex:A} ${description} with`, {
            tag: "{tag}",
            firstTag: sortedTags?.[0],
          });
        }
        return format(`{firstTag:regex:A} ${description} environment with`, {
          tag: "{tag}",
          firstTag: sortedTags?.[0],
        });
      }
      return "";
    }
    if (propertyPath === "tags") {
      if (data?.projectType === "game") {
        return `Search mechanics, genres, or subjects`;
      }
      if (data?.projectType === "story") {
        return `Search genres, aesthetics, or subjects`;
      }
      if (data?.projectType === "character" || data?.projectType === "voice") {
        return `Search traits or archetypes`;
      }
    }
    return super.getPropertyPlaceholder(propertyPath, data);
  }

  getPropertyHelperText(propertyPath: string, data: ProjectDocument): string {
    if (propertyPath === "tags" && !data?._createdAt && data.tags.length > 0) {
      return `Tap a tag to lock it in while randomizing.`;
    }
    if (propertyPath === "name" && !data?._createdAt) {
      return `Tap the lightbulb for more suggestions!`;
    }
    if (propertyPath === "summary" && !data?._createdAt) {
      if (data?.projectType === "game") {
        return `Good pitches have a strong sense of irony.`;
      }
      if (data?.projectType === "story") {
        return `Good loglines have a strong sense of irony.`;
      }
      if (data?.projectType === "character") {
        return `Interesting characters are flawed but easy to root for.`;
      }
    }
    return undefined;
  }

  getPropertyMoreInfoPopup(
    propertyPath: string,
    data: ProjectDocument
  ): {
    icon?: string;
    title?: string;
    description?: string;
    caption?: string;
    alignment?: "flex-start" | "center" | "flex-end";
  } {
    if (propertyPath === "summary" && !data?._createdAt) {
      if (data.projectType === "story") {
        return {
          icon: "info-circle",
          title: "What makes a good logline?",
          description: `1. It begins with the inciting action (the catalyst).
2. It describes an interesting protagonist (the hero).
3. It clearly outlines the central conflict (the obstacle the hero must overcome) and the objective (the hero's goal).
4. It's apparent what's at risk should the protagonist fail (the stakes).`,
          caption: `Below are some examples of solid loglines:

- **The Exorcist**: When a teenage girl is possessed by a mysterious entity, her mother seeks the help of two priests to save her daughter.

- **Reservoir Dogs**: After a simple jewelry heist goes terribly wrong, the surviving criminals begin to suspect that one of them is a police informant.

- **Take Shelter**: Plagued by a series of apocalyptic visions, a young husband and father questions whether to shelter his family from a coming storm, or from himself.
    `,
        };
      }
      if (data.projectType === "game") {
        return {
          icon: "info-circle",
          title: "What makes a good game pitch?",
          description: `1. It is short. 
2. It paints a compelling mental picture.
3. It has a strong sense of irony.
4. It clearly describes what the player will be doing (a.k.a. "The Core Gameplay Loop").
5. (And most importantly) The gameplay sounds fun or engaging!`,
          caption: `Below are some examples of excellent game pitches from 'The Beginner's Guide':

- **Man Eating Beast**: A game where you are chased by a beast that's trying to eat you. Simultaneously, you are trying to eat the beast.

- **The Family Jewels**: A game where you play a queen dusting your jewelry while your kingdom is destroyed.

- **Captain's Orders**: A game where you live on a boat taking orders from the captain. The captain is always wrong.

- **Reality Check**: A game where you are paid to talk people down from pursuing their hopes and dreams.

- **Meat Market**: A game where you run a shop inside your body, selling your organs strategically to make the most money before you die.
`,
        };
      }
    }
    return super.getPropertyMoreInfoPopup(propertyPath, data);
  }
}
