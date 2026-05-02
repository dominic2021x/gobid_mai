"use client";

import { useMemo } from 'react';

export interface PropertyMapProps {
  address?: string;
  coordinates?: { lat: number; lng: number };
  height?: string;
  /** În carduri: doar iframe, fără footer și fără bordură */
  compact?: boolean;
}

export default function PropertyMap({ address, coordinates, height = 'h-64', compact }: PropertyMapProps) {
  const { src, label, link } = useMemo(() => {
    const hasCoords = typeof coordinates?.lat === 'number' && typeof coordinates?.lng === 'number';
    const query = hasCoords
      ? `${coordinates!.lat},${coordinates!.lng}`
      : (address || '').trim();

    const safeQuery = query || 'România';
    const zoom = hasCoords ? 15 : 10;
    const embedSrc = `https://www.google.com/maps?q=${encodeURIComponent(safeQuery)}&z=${zoom}&output=embed`;
    const openLink = `https://www.google.com/maps?q=${encodeURIComponent(safeQuery)}&z=${zoom}`;

    return {
      src: embedSrc,
      link: openLink,
      label: address || (hasCoords ? `${coordinates!.lat}, ${coordinates!.lng}` : 'Locație'),
    };
  }, [address, coordinates]);

  if (compact) {
    return (
      <div className={`w-full ${height} overflow-hidden bg-gray-100 dark:bg-gray-800`}>
        <iframe
          title={`Harta: ${label}`}
          src={src}
          className="w-full h-full min-h-[12rem]"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <div className={`w-full ${height} rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden bg-gray-100 dark:bg-gray-800`}>
      <iframe
        title={`Harta: ${label}`}
        src={src}
        className="w-full h-full"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        allowFullScreen
      />
      <div className="px-3 py-2 text-xs text-gray-600 dark:text-gray-300 border-t border-gray-300 dark:border-gray-600 bg-white/70 dark:bg-gray-900/40 backdrop-blur-sm">
        <a href={link} target="_blank" rel="noreferrer" className="underline hover:opacity-80">
          Deschide în Google Maps
        </a>
      </div>
    </div>
  );
}



