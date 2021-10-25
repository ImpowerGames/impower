const getReadOnlyFields = (): string[] => {
  return [
    "score",
    "rating",
    "rank",
    "likes",
    "dislikes",
    "kudos",
    "contributions",
    "comments",
    "removed",
    "daysWhenWeekOld",
    "hoursWhenDayOld",
    "monthsWhenYearOld",
    "weeksWhenMonthOld",
    "nsfw",
    "terms",
    "flagged",
    "og",
    "delisted",
    "_serverUpdatedAt",
    "_aggregatedAt",
  ];
};

export default getReadOnlyFields;
