const queues = new Map<string, Promise<unknown>>();

export const withProjectRecord = async <T>(
  projectId: string,
  task: () => Promise<T>,
): Promise<T> => {
  const locks = globalThis.navigator?.locks;
  if (locks) {
    return await locks.request(`impower-backup-record:${projectId}`, task);
  }
  const run = (queues.get(projectId) ?? Promise.resolve()).then(task);
  queues.set(
    projectId,
    run.catch(() => undefined),
  );
  return run;
};
