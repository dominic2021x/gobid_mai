/**
 * Location relaxation ladder: STRICT -> NEARBY -> ALL.
 * STRICT: cityId or exact selected location (city name).
 * NEARBY: countyId/regionId or radius if coords exist (simplified: we use "all" if no county map).
 * ALL: no location filter.
 */

export type LocationMode = 'strict' | 'nearby' | 'all';

export interface LocationScope {
  mode: LocationMode;
  /** For strict: city name or id; for nearby: county/region; for all: undefined */
  value?: string;
}

/**
 * Build location ladder for current request.
 * If STRICT yields 0, expand to NEARBY (if we had county/region), else ALL.
 */
export function getLocationLadder(selectedLocation: string | null): LocationScope[] {
  if (!selectedLocation || selectedLocation === 'all' || selectedLocation.trim() === '') {
    return [{ mode: 'all' }];
  }
  const strict: LocationScope = { mode: 'strict', value: selectedLocation.trim() };
  return [strict, { mode: 'all' }];
}

/**
 * Meta flag: set expandedLocation=true when we switched from STRICT to NEARBY/ALL.
 */
export function wasLocationExpanded(
  requestedMode: LocationMode,
  usedMode: LocationMode
): boolean {
  return requestedMode === 'strict' && (usedMode === 'nearby' || usedMode === 'all');
}
