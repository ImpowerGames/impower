export const getBaseRoute = (route: string): string => {
  const subPageIndex = route.substring(1).indexOf("/");
  if (subPageIndex >= 0) {
    return route.substring(0, subPageIndex + 1);
  }
  return route;
};
