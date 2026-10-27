export type SceneCapabilities = {
  width: number;
  pixelRatio: number;
  cores?: number;
  memory?: number;
  saveData?: boolean;
  reducedMotion: boolean;
};

/** A decorative scene never takes priority over the task or device budget. */
export function chooseSceneQuality(capabilities: SceneCapabilities) {
  const constrained =
    capabilities.saveData ||
    (capabilities.cores !== undefined && capabilities.cores <= 4) ||
    (capabilities.memory !== undefined && capabilities.memory <= 2);
  const compact = capabilities.width < 640 || capabilities.cores === undefined;
  const quality =
    constrained || capabilities.reducedMotion ? 'static' : compact ? 'compact' : 'full';
  return {
    quality,
    reason: capabilities.reducedMotion
      ? 'reduced-motion'
      : constrained
        ? 'device-budget'
        : 'normal',
    particles: quality === 'static' ? 10 : quality === 'compact' ? 18 : 30,
    pixelRatio: Math.max(
      1,
      Math.min(capabilities.pixelRatio || 1, quality === 'full' ? 1.75 : 1.25),
    ),
  } as const;
}

/** Ignore isolated stalls; only a sustained missed-frame window retires motion. */
export function sceneIsOverBudget(frameIntervals: readonly number[]) {
  if (frameIntervals.length < 60) return false;
  const useful = frameIntervals.filter((interval) => Number.isFinite(interval) && interval > 0);
  return (
    useful.length >= 60 && useful.filter((interval) => interval > 40).length / useful.length > 0.45
  );
}
