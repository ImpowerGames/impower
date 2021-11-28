import { ProjectType } from "../../impower-data-store";

export const getRequiredTagCounts = (
  requiredTagTotal: number,
  type?: ProjectType
): {
  requiredMechanicCount: number;
  requiredGenreCount: number;
  requiredAestheticCount: number;
  requiredSubjectCount: number;
} => {
  if (requiredTagTotal === 1) {
    if (type === "game") {
      return {
        requiredMechanicCount: 0,
        requiredGenreCount: 0,
        requiredAestheticCount: 0,
        requiredSubjectCount: 0,
      };
    }
    if (type === "story") {
      return {
        requiredMechanicCount: null,
        requiredGenreCount: 0,
        requiredAestheticCount: 0,
        requiredSubjectCount: 0,
      };
    }
  }
  if (requiredTagTotal === 2) {
    if (type === "game") {
      return {
        requiredMechanicCount: 1,
        requiredGenreCount: 0,
        requiredAestheticCount: 0,
        requiredSubjectCount: 0,
      };
    }
    if (type === "story") {
      return {
        requiredMechanicCount: null,
        requiredGenreCount: 0,
        requiredAestheticCount: 0,
        requiredSubjectCount: 1,
      };
    }
  }
  if (requiredTagTotal === 3) {
    if (type === "game") {
      return {
        requiredMechanicCount: 1,
        requiredGenreCount: 0,
        requiredAestheticCount: 0,
        requiredSubjectCount: 1,
      };
    }
    if (type === "story") {
      return {
        requiredMechanicCount: null,
        requiredGenreCount: 1,
        requiredAestheticCount: 0,
        requiredSubjectCount: 1,
      };
    }
  }
  if (requiredTagTotal === 4) {
    if (type === "game") {
      return {
        requiredMechanicCount: 1,
        requiredGenreCount: 1,
        requiredAestheticCount: 1,
        requiredSubjectCount: 1,
      };
    }
    if (type === "story") {
      return {
        requiredMechanicCount: null,
        requiredGenreCount: 2,
        requiredAestheticCount: 1,
        requiredSubjectCount: 1,
      };
    }
  }
  if (requiredTagTotal === 5) {
    if (type === "game") {
      return {
        requiredMechanicCount: 2,
        requiredGenreCount: 1,
        requiredAestheticCount: 1,
        requiredSubjectCount: 1,
      };
    }
    if (type === "story") {
      return {
        requiredMechanicCount: null,
        requiredGenreCount: 2,
        requiredAestheticCount: 1,
        requiredSubjectCount: 2,
      };
    }
  }
  if (requiredTagTotal === 6) {
    if (type === "game") {
      return {
        requiredMechanicCount: 2,
        requiredGenreCount: 2,
        requiredAestheticCount: 1,
        requiredSubjectCount: 1,
      };
    }
    if (type === "story") {
      return {
        requiredMechanicCount: null,
        requiredGenreCount: 2,
        requiredAestheticCount: 2,
        requiredSubjectCount: 2,
      };
    }
  }
  if (requiredTagTotal === 7) {
    if (type === "game") {
      return {
        requiredMechanicCount: 2,
        requiredGenreCount: 2,
        requiredAestheticCount: 1,
        requiredSubjectCount: 2,
      };
    }
    if (type === "story") {
      return {
        requiredMechanicCount: null,
        requiredGenreCount: 2,
        requiredAestheticCount: 2,
        requiredSubjectCount: 3,
      };
    }
  }
  if (requiredTagTotal === 8) {
    if (type === "game") {
      return {
        requiredMechanicCount: 2,
        requiredGenreCount: 2,
        requiredAestheticCount: 2,
        requiredSubjectCount: 2,
      };
    }
    if (type === "story") {
      return {
        requiredMechanicCount: null,
        requiredGenreCount: 3,
        requiredAestheticCount: 2,
        requiredSubjectCount: 3,
      };
    }
  }
  if (requiredTagTotal === 9) {
    if (type === "game") {
      return {
        requiredMechanicCount: 3,
        requiredGenreCount: 2,
        requiredAestheticCount: 2,
        requiredSubjectCount: 2,
      };
    }
    if (type === "story") {
      return {
        requiredMechanicCount: null,
        requiredGenreCount: 3,
        requiredAestheticCount: 3,
        requiredSubjectCount: 3,
      };
    }
  }
  if (requiredTagTotal === 10) {
    if (type === "game") {
      return {
        requiredMechanicCount: 3,
        requiredGenreCount: 2,
        requiredAestheticCount: 2,
        requiredSubjectCount: 3,
      };
    }
    if (type === "story") {
      return {
        requiredMechanicCount: null,
        requiredGenreCount: 3,
        requiredAestheticCount: 3,
        requiredSubjectCount: 4,
      };
    }
  }
  return {
    requiredMechanicCount: null,
    requiredGenreCount: null,
    requiredAestheticCount: null,
    requiredSubjectCount: null,
  };
};
