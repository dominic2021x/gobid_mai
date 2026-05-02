export type CityCandidate = {
  city: string;
  cityNorm: string;
  county?: string | null;
  lat?: number | null;
  lng?: number | null;
};

export type RankCitiesInput = {
  cities: CityCandidate[];
  userPreferredCity?: string | null;
  userCoords?: { lat: number; lng: number } | null;
};

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sa = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(sa));
}

export function rankCities(input: RankCitiesInput): CityCandidate[] {
  const preferredNorm = (input.userPreferredCity ?? "").trim().toLowerCase();

  return [...input.cities].sort((a, b) => {
    if (input.userCoords && a.lat != null && a.lng != null && b.lat != null && b.lng != null) {
      const dA = haversineKm(input.userCoords, { lat: a.lat, lng: a.lng });
      const dB = haversineKm(input.userCoords, { lat: b.lat, lng: b.lng });
      if (dA !== dB) return dA - dB;
    }

    const aPref = preferredNorm && (a.cityNorm === preferredNorm || a.city.toLowerCase() === preferredNorm) ? 1 : 0;
    const bPref = preferredNorm && (b.cityNorm === preferredNorm || b.city.toLowerCase() === preferredNorm) ? 1 : 0;
    if (aPref !== bPref) return bPref - aPref;

    return a.city.localeCompare(b.city, "ro");
  });
}

