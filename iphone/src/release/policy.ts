export type ReleasePlatform = 'ios' | 'web';
export type ReleasePolicy = {
  minimumBuild: number;
  recommendedBuild: number;
  revision: number;
  storeUrl: string | null;
  maintenanceUntil: string | null;
};

function validNumber(value: unknown, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max;
}

export function readPolicy(value: unknown, platform: ReleasePlatform): ReleasePolicy {
  if (!value || typeof value !== 'object') throw new Error('Invalid release policy');
  const { minimumBuild, recommendedBuild, revision, storeUrl, maintenanceUntil } = value as Record<string, unknown>;
  const validListing = typeof storeUrl === 'string' && /^https:\/\/apps\.apple\.com\/app\/id[1-9][0-9]{0,18}$/.test(storeUrl);
  if (!validNumber(minimumBuild, 999999) || !validNumber(recommendedBuild, 999999) ||
      !validNumber(revision, Number.MAX_SAFE_INTEGER) || (recommendedBuild > 0 && recommendedBuild < minimumBuild) ||
      (storeUrl !== null && (platform !== 'ios' || !validListing)) ||
      (platform === 'ios' && (minimumBuild > 0 || recommendedBuild > 0) && !validListing) ||
      (maintenanceUntil !== null && (typeof maintenanceUntil !== 'string' || !Number.isFinite(Date.parse(maintenanceUntil))))) {
    throw new Error('Invalid release policy');
  }
  return { minimumBuild, recommendedBuild, revision, storeUrl: storeUrl as string | null, maintenanceUntil };
}
