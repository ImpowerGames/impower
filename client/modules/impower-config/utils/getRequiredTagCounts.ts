export const getRequiredTagCounts = (
  requiredTagTotal: number
): {
  requiredMechanicCount: number;
  requiredGenreCount: number;
  requiredAestheticCount: number;
  requiredSubjectCount: number;
} => {
  if (requiredTagTotal === 2) {
    return {
      requiredMechanicCount: 1,
      requiredGenreCount: 0,
      requiredAestheticCount: 0,
      requiredSubjectCount: 0,
    };
  }
  if (requiredTagTotal === 3) {
    return {
      requiredMechanicCount: 1,
      requiredGenreCount: 0,
      requiredAestheticCount: 0,
      requiredSubjectCount: 1,
    };
  }
  if (requiredTagTotal === 4) {
    return {
      requiredMechanicCount: 1,
      requiredGenreCount: 1,
      requiredAestheticCount: 1,
      requiredSubjectCount: 1,
    };
  }
  if (requiredTagTotal === 5) {
    return {
      requiredMechanicCount: 2,
      requiredGenreCount: 1,
      requiredAestheticCount: 1,
      requiredSubjectCount: 1,
    };
  }
  if (requiredTagTotal === 6) {
    return {
      requiredMechanicCount: 2,
      requiredGenreCount: 2,
      requiredAestheticCount: 1,
      requiredSubjectCount: 1,
    };
  }
  if (requiredTagTotal === 7) {
    return {
      requiredMechanicCount: 2,
      requiredGenreCount: 2,
      requiredAestheticCount: 1,
      requiredSubjectCount: 2,
    };
  }
  if (requiredTagTotal === 8) {
    return {
      requiredMechanicCount: 2,
      requiredGenreCount: 2,
      requiredAestheticCount: 2,
      requiredSubjectCount: 2,
    };
  }
  if (requiredTagTotal === 9) {
    return {
      requiredMechanicCount: 3,
      requiredGenreCount: 2,
      requiredAestheticCount: 2,
      requiredSubjectCount: 2,
    };
  }
  if (requiredTagTotal === 10) {
    return {
      requiredMechanicCount: 3,
      requiredGenreCount: 2,
      requiredAestheticCount: 2,
      requiredSubjectCount: 3,
    };
  }
  return {
    requiredMechanicCount: 0,
    requiredGenreCount: 0,
    requiredAestheticCount: 0,
    requiredSubjectCount: 0,
  };
};
