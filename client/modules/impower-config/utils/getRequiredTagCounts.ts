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
      };
    }
    if (type === "character") {
      return {
        mechanics: null,
        genres: null,
        aesthetics: null,
        subjects: null,
        moods: 0,
        archetypes: 1,
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
      };
    }
    if (type === "character") {
      return {
        mechanics: null,
        genres: null,
        aesthetics: null,
        subjects: null,
        moods: 1,
        archetypes: 1,
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
      };
    }
    if (type === "character") {
      return {
        mechanics: null,
        genres: 0,
        aesthetics: 0,
        subjects: 0,
        moods: 1,
        archetypes: 1,
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
      };
    }
    if (type === "character") {
      return {
        mechanics: null,
        genres: 0,
        aesthetics: 0,
        subjects: 1,
        moods: 1,
        archetypes: 1,
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
      };
    }
    if (type === "character") {
      return {
        mechanics: null,
        genres: 1,
        aesthetics: 1,
        subjects: 1,
        moods: 1,
        archetypes: 1,
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
      };
    }
    if (type === "character") {
      return {
        mechanics: null,
        genres: 1,
        aesthetics: 1,
        subjects: 1,
        moods: 2,
        archetypes: 1,
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
      };
    }
    if (type === "character") {
      return {
        mechanics: null,
        genres: 1,
        aesthetics: 1,
        subjects: 2,
        moods: 2,
        archetypes: 1,
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
      };
    }
    if (type === "character") {
      return {
        mechanics: null,
        genres: 2,
        aesthetics: 1,
        subjects: 2,
        moods: 2,
        archetypes: 1,
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
      };
    }
    if (type === "character") {
      return {
        mechanics: null,
        genres: 2,
        aesthetics: 1,
        subjects: 2,
        moods: 2,
        archetypes: 2,
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
      };
    }
    if (type === "character") {
      return {
        mechanics: null,
        genres: 2,
        aesthetics: 2,
        subjects: 2,
        moods: 2,
        archetypes: 2,
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
  };
};
