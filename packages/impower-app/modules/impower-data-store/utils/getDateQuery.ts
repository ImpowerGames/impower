import { DateAge } from "../types/enums/dateAge";
import getAge from "./getAge";

const getDateQuery = (age?: DateAge): string => {
  const dateNow = new Date();
  const queryInput: {
    [range in DateAge]: { fieldPath: string; value: number };
  } = {
    d: {
      fieldPath: "hoursWhenDayOld",
      value: getAge(dateNow, "h", true),
    },
    w: {
      fieldPath: "daysWhenWeekOld",
      value: getAge(dateNow, "d", true),
    },
    mo: {
      fieldPath: "weeksWhenMonthOld",
      value: getAge(dateNow, "w", true),
    },
    yr: {
      fieldPath: "monthsWhenYearOld",
      value: getAge(dateNow, "mo", true),
    },
  };
  const input = queryInput[age];

  const dateQuery = `${input.fieldPath}#${input.value}`;

  return dateQuery;
};

export default getDateQuery;
