import { NextRouter, useRouter as useNextRouter } from "next/router";
import { useMemo } from "react";

export const useRouter = (): NextRouter => {
  const nextRouter = useNextRouter();
  return useMemo(() => nextRouter, [nextRouter]);
};
