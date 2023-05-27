import { ProjectType } from "../../impower-data-store";

export const getRequiredTagCounts = (
  requiredTagTotal: number,
  type?: ProjectType
): {
  mechanics: number;
  genres: number;
  aesthetics: number;
  subjects: number;
  moods: number;
  archetypes: number;
  locations: number;
  atmospheres: number;
  visualStyles: number;
  musicalStyles: number;
} => {
  if (requiredTagTotal === 1) {
    if (type === "game") {
      return {
        mechanics: 0,
        genres: 0,
        aesthetics: 0,
        subjects: 0,
        moods: null,
        archetypes: null,
        locations: null,
        atmospheres: null,
        visualStyles: null,
        musicalStyles: null,
      };
    }
    if (type === "story") {
      return {
        mechanics: null,
        genres: 0,
        aesthetics: 0,
        subjects: 0,
        moods: null,
        archetypes: null,
        locations: null,
        atmospheres: null,
        visualStyles: null,
        musicalStyles: null,
      };
    }
    if (type === "character" || type === "voice") {
      return {
        mechanics: null,
        genres: null,
        aesthetics: null,
        subjects: null,
        moods: 0,
        archetypes: 1,
        locations: null,
        atmospheres: null,
        visualStyles: null,
        musicalStyles: null,
      };
    }
    if (type === "environment" || type === "sound") {
      return {
        mechanics: null,
        genres: null,
        aesthetics: null,
        subjects: null,
        moods: null,
        archetypes: null,
        locations: 1,
        atmospheres: 0,
        visualStyles: null,
        musicalStyles: null,
      };
    }
    if (type === "music") {
      return {
        mechanics: null,
        genres: null,
        aesthetics: null,
        subjects: null,
        moods: null,
        archetypes: null,
        locations: null,
        atmospheres: null,
        visualStyles: null,
        musicalStyles: 1,
      };
    }
  }
  if (requiredTagTotal === 2) {
    if (type === "game") {
      return {
        mechanics: 1,
        genres: 0,
        aesthetics: 0,
        subjects: 0,
        moods: null,
        archetypes: null,
        locations: null,
        atmospheres: null,
        visualStyles: null,
        musicalStyles: null,
      };
    }
    if (type === "story") {
      return {
        mechanics: null,
        genres: 0,
        aesthetics: 0,
        subjects: 1,
        moods: null,
        archetypes: null,
        locations: null,
        atmospheres: null,
        visualStyles: null,
        musicalStyles: null,
      };
    }
    if (type === "character" || type === "voice") {
      return {
        mechanics: null,
        genres: null,
        aesthetics: null,
        subjects: null,
        moods: 1,
        archetypes: 1,
        locations: null,
        atmospheres: null,
        visualStyles: null,
        musicalStyles: null,
      };
    }
    if (type === "environment" || type === "sound") {
      return {
        mechanics: null,
        genres: null,
        aesthetics: null,
        subjects: null,
        moods: null,
        archetypes: null,
        locations: 1,
        atmospheres: 1,
        visualStyles: null,
        musicalStyles: null,
      };
    }
    if (type === "music") {
      return {
        mechanics: null,
        genres: null,
        aesthetics: null,
        subjects: null,
        moods: 1,
        archetypes: null,
        locations: null,
        atmospheres: null,
        visualStyles: null,
        musicalStyles: 1,
      };
    }
  }
  if (requiredTagTotal === 3) {
    if (type === "game") {
      return {
        mechanics: 1,
        genres: 0,
        aesthetics: 0,
        subjects: 1,
        moods: null,
        archetypes: null,
        locations: null,
        atmospheres: null,
        visualStyles: null,
        musicalStyles: null,
      };
    }
    if (type === "story") {
      return {
        mechanics: null,
        genres: 1,
        aesthetics: 0,
        subjects: 1,
        moods: null,
        archetypes: null,
        locations: null,
        atmospheres: null,
        visualStyles: null,
        musicalStyles: null,
      };
    }
    if (type === "character" || type === "voice") {
      return {
        mechanics: null,
        genres: 0,
        aesthetics: 0,
        subjects: 0,
        moods: 1,
        archetypes: 1,
        locations: null,
        atmospheres: null,
        visualStyles: null,
        musicalStyles: null,
      };
    }
    if (type === "environment" || type === "sound") {
      return {
        mechanics: null,
        genres: null,
        aesthetics: null,
        subjects: 1,
        moods: null,
        archetypes: null,
        locations: 1,
        atmospheres: 1,
        visualStyles: null,
        musicalStyles: null,
      };
    }
    if (type === "music") {
      return {
        mechanics: null,
        genres: null,
        aesthetics: null,
        subjects: null,
        moods: 1,
        archetypes: null,
        locations: null,
        atmospheres: null,
        visualStyles: null,
        musicalStyles: 2,
      };
    }
  }
  if (requiredTagTotal === 4) {
    if (type === "game") {
      return {
        mechanics: 1,
        genres: 1,
        aesthetics: 1,
        subjects: 1,
        moods: null,
        archetypes: null,
        locations: null,
        atmospheres: null,
        visualStyles: null,
        musicalStyles: null,
      };
    }
    if (type === "story") {
      return {
        mechanics: null,
        genres: 2,
        aesthetics: 1,
        subjects: 1,
        moods: null,
        archetypes: null,
        locations: null,
        atmospheres: null,
        visualStyles: null,
        musicalStyles: null,
      };
    }
    if (type === "character" || type === "voice") {
      return {
        mechanics: null,
        genres: 0,
        aesthetics: 0,
        subjects: 1,
        moods: 1,
        archetypes: 1,
        locations: null,
        atmospheres: null,
        visualStyles: null,
        musicalStyles: null,
      };
    }
    if (type === "environment" || type === "sound") {
      return {
        mechanics: null,
        genres: 1,
        aesthetics: null,
        subjects: 1,
        moods: null,
        archetypes: 1,
        locations: 1,
        atmospheres: 1,
        visualStyles: null,
        musicalStyles: null,
      };
    }
    if (type === "music") {
      return {
        mechanics: null,
        genres: null,
        aesthetics: null,
        subjects: null,
        moods: 1,
        archetypes: null,
        locations: null,
        atmospheres: 1,
        visualStyles: null,
        musicalStyles: 2,
      };
    }
  }
  if (requiredTagTotal === 5) {
    if (type === "game") {
      return {
        mechanics: 2,
        genres: 1,
        aesthetics: 1,
        subjects: 1,
        moods: null,
        archetypes: null,
        locations: null,
        atmospheres: null,
        visualStyles: null,
        musicalStyles: null,
      };
    }
    if (type === "story") {
      return {
        mechanics: null,
        genres: 2,
        aesthetics: 1,
        subjects: 2,
        moods: null,
        archetypes: null,
        locations: null,
        atmospheres: null,
        visualStyles: null,
        musicalStyles: null,
      };
    }
    if (type === "character" || type === "voice") {
      return {
        mechanics: null,
        genres: 1,
        aesthetics: 1,
        subjects: 1,
        moods: 1,
        archetypes: 1,
        locations: null,
        atmospheres: null,
        visualStyles: null,
        musicalStyles: null,
      };
    }
    if (type === "environment" || type === "sound") {
      return {
        mechanics: null,
        genres: 1,
        aesthetics: null,
        subjects: 1,
        moods: null,
        archetypes: null,
        locations: 1,
        atmospheres: 1,
        visualStyles: null,
        musicalStyles: null,
      };
    }
    if (type === "music") {
      return {
        mechanics: null,
        genres: null,
        aesthetics: null,
        subjects: 0,
        moods: 1,
        archetypes: 0,
        locations: 0,
        atmospheres: 1,
        visualStyles: null,
        musicalStyles: 2,
      };
    }
  }
  if (requiredTagTotal === 6) {
    if (type === "game") {
      return {
        mechanics: 2,
        genres: 2,
        aesthetics: 1,
        subjects: 1,
        moods: null,
        archetypes: null,
        locations: null,
        atmospheres: null,
        visualStyles: null,
        musicalStyles: null,
      };
    }
    if (type === "story") {
      return {
        mechanics: null,
        genres: 2,
        aesthetics: 2,
        subjects: 2,
        moods: null,
        archetypes: null,
        locations: null,
        atmospheres: null,
        visualStyles: null,
        musicalStyles: null,
      };
    }
    if (type === "character" || type === "voice") {
      return {
        mechanics: null,
        genres: 1,
        aesthetics: 1,
        subjects: 1,
        moods: 2,
        archetypes: 1,
        locations: null,
        atmospheres: null,
        visualStyles: null,
        musicalStyles: null,
      };
    }
    if (type === "environment" || type === "sound") {
      return {
        mechanics: null,
        genres: 1,
        aesthetics: null,
        subjects: 2,
        moods: null,
        archetypes: 1,
        locations: 1,
        atmospheres: 1,
        visualStyles: null,
        musicalStyles: null,
      };
    }
    if (type === "music") {
      return {
        mechanics: null,
        genres: null,
        aesthetics: null,
        subjects: 1,
        moods: 1,
        archetypes: 0,
        locations: 0,
        atmospheres: 1,
        visualStyles: null,
        musicalStyles: 2,
      };
    }
  }
  if (requiredTagTotal === 7) {
    if (type === "game") {
      return {
        mechanics: 2,
        genres: 2,
        aesthetics: 1,
        subjects: 2,
        moods: null,
        archetypes: null,
        locations: null,
        atmospheres: null,
        visualStyles: null,
        musicalStyles: null,
      };
    }
    if (type === "story") {
      return {
        mechanics: null,
        genres: 2,
        aesthetics: 2,
        subjects: 3,
        moods: null,
        archetypes: null,
        locations: null,
        atmospheres: null,
        visualStyles: null,
        musicalStyles: null,
      };
    }
    if (type === "character" || type === "voice") {
      return {
        mechanics: null,
        genres: 1,
        aesthetics: 1,
        subjects: 2,
        moods: 2,
        archetypes: 1,
        locations: null,
        atmospheres: null,
        visualStyles: null,
        musicalStyles: null,
      };
    }
    if (type === "environment" || type === "sound") {
      return {
        mechanics: null,
        genres: 1,
        aesthetics: null,
        subjects: 2,
        moods: null,
        archetypes: 1,
        locations: 1,
        atmospheres: 1,
        visualStyles: null,
        musicalStyles: null,
      };
    }
    if (type === "music") {
      return {
        mechanics: null,
        genres: null,
        aesthetics: null,
        subjects: 1,
        moods: 1,
        archetypes: 1,
        locations: 1,
        atmospheres: 1,
        visualStyles: null,
        musicalStyles: 2,
      };
    }
  }
  if (requiredTagTotal === 8) {
    if (type === "game") {
      return {
        mechanics: 2,
        genres: 2,
        aesthetics: 2,
        subjects: 2,
        moods: null,
        archetypes: null,
        locations: null,
        atmospheres: null,
        visualStyles: null,
        musicalStyles: null,
      };
    }
    if (type === "story") {
      return {
        mechanics: null,
        genres: 3,
        aesthetics: 2,
        subjects: 3,
        moods: null,
        archetypes: null,
        locations: null,
        atmospheres: null,
        visualStyles: null,
        musicalStyles: null,
      };
    }
    if (type === "character" || type === "voice") {
      return {
        mechanics: null,
        genres: 2,
        aesthetics: 1,
        subjects: 2,
        moods: 2,
        archetypes: 1,
        locations: null,
        atmospheres: null,
        visualStyles: null,
        musicalStyles: null,
      };
    }
    if (type === "environment" || type === "sound") {
      return {
        mechanics: null,
        genres: 2,
        aesthetics: null,
        subjects: 2,
        moods: null,
        archetypes: 1,
        locations: 1,
        atmospheres: 2,
        visualStyles: null,
        musicalStyles: null,
      };
    }
    if (type === "music") {
      return {
        mechanics: null,
        genres: null,
        aesthetics: null,
        subjects: 2,
        moods: 1,
        archetypes: 1,
        locations: 1,
        atmospheres: 1,
        visualStyles: null,
        musicalStyles: 2,
      };
    }
  }
  if (requiredTagTotal === 9) {
    if (type === "game") {
      return {
        mechanics: 3,
        genres: 2,
        aesthetics: 2,
        subjects: 2,
        moods: null,
        archetypes: null,
        locations: null,
        atmospheres: null,
        visualStyles: null,
        musicalStyles: null,
      };
    }
    if (type === "story") {
      return {
        mechanics: null,
        genres: 3,
        aesthetics: 3,
        subjects: 3,
        moods: null,
        archetypes: null,
        locations: null,
        atmospheres: null,
        visualStyles: null,
        musicalStyles: null,
      };
    }
    if (type === "character" || type === "voice") {
      return {
        mechanics: null,
        genres: 2,
        aesthetics: 1,
        subjects: 2,
        moods: 2,
        archetypes: 2,
        locations: null,
        atmospheres: null,
        visualStyles: null,
        musicalStyles: null,
      };
    }
    if (type === "environment" || type === "sound") {
      return {
        mechanics: null,
        genres: 2,
        aesthetics: null,
        subjects: 2,
        moods: null,
        archetypes: 2,
        locations: 1,
        atmospheres: 2,
        visualStyles: null,
        musicalStyles: null,
      };
    }
    if (type === "music") {
      return {
        mechanics: null,
        genres: null,
        aesthetics: null,
        subjects: 2,
        moods: 2,
        archetypes: 1,
        locations: 1,
        atmospheres: 1,
        visualStyles: null,
        musicalStyles: 2,
      };
    }
  }
  if (requiredTagTotal === 10) {
    if (type === "game") {
      return {
        mechanics: 3,
        genres: 2,
        aesthetics: 2,
        subjects: 3,
        moods: null,
        archetypes: null,
        locations: null,
        atmospheres: null,
        visualStyles: null,
        musicalStyles: null,
      };
    }
    if (type === "story") {
      return {
        mechanics: null,
        genres: 3,
        aesthetics: 3,
        subjects: 4,
        moods: null,
        archetypes: null,
        locations: null,
        atmospheres: null,
        visualStyles: null,
        musicalStyles: null,
      };
    }
    if (type === "character" || type === "voice") {
      return {
        mechanics: null,
        genres: 2,
        aesthetics: 2,
        subjects: 2,
        moods: 2,
        archetypes: 2,
        locations: null,
        atmospheres: null,
        visualStyles: null,
        musicalStyles: null,
      };
    }
    if (type === "environment" || type === "sound") {
      return {
        mechanics: null,
        genres: 2,
        aesthetics: null,
        subjects: 2,
        moods: null,
        archetypes: 2,
        locations: 2,
        atmospheres: 2,
        visualStyles: null,
        musicalStyles: null,
      };
    }
    if (type === "music") {
      return {
        mechanics: null,
        genres: null,
        aesthetics: null,
        subjects: 2,
        moods: 2,
        archetypes: 1,
        locations: 1,
        atmospheres: 2,
        visualStyles: null,
        musicalStyles: 2,
      };
    }
  }
  return {
    mechanics: null,
    genres: null,
    aesthetics: null,
    subjects: null,
    moods: null,
    archetypes: null,
    locations: null,
    atmospheres: null,
    visualStyles: null,
    musicalStyles: null,
  };
};
