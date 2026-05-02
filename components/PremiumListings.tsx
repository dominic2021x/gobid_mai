'use client';

import React from 'react';
import Image from 'next/image';
import { HeartIcon, LocationIcon } from '@/components/HeroIcons';
import PropertyMap from '@/components/PropertyMap';
import { ProductConditionBadge } from '@/components/ProductConditionBadge';
import { PieseAutoMarcaInlineSpan } from '@/components/piese-auto/PieseAutoMarcaBadges';

export interface PremiumListingItem {
  id: string;
  title: string;
  image: string;
  price: string;
  location?: string;
  condition?: string;
  createdAt?: string | null;
  url?: string;
  slug?: string;
  address?: string | null;
  coordinates?: { lat: number; lng: number } | null;
  category?: string | null;
  subcategory?: string | null;
  brand?: string | null;
  custom_fields?: Record<string, unknown> | null;
}

function getDisplayCity(location: string | undefined): string {
  if (!location || !String(location).trim()) return '';
  const s = String(location).trim();
  const locMatch = s.match(/loc\.\s*([^,]+)/i);
  if (locMatch) return locMatch[1].trim();
  const judMatch = s.match(/jud\.\s*([^,]+)/i);
  if (judMatch) return judMatch[1].trim();
  const first = s.split(',')[0].trim();
  const parts = first.split(/\s+/);
  const last = parts[parts.length - 1];
  if (last && last.length <= 25) return last;
  return first.length <= 30 ? first : s;
}

function isConditionNew(condition: string | undefined): boolean {
  if (!condition) return false;
  const c = String(condition).trim().toLowerCase();
  return c === 'nou' || c === 'nouă';
}

function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  const day = d.getDate().toString().padStart(2, '0');
  const monthNames = ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sep', 'oct', 'noi', 'dec'];
  const month = monthNames[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

export interface PremiumListingsProps {
  auctions: PremiumListingItem[];
  isDarkMode?: boolean;
  isFavorite: (id: string) => boolean;
  onToggleFavorite: (id: string) => void;
}

export function PremiumListings({
  auctions,
  isDarkMode = false,
  isFavorite,
  onToggleFavorite,
}: PremiumListingsProps) {
  if (auctions.length === 0) return null;

  const displayAuctions = auctions.slice(0, 4);

  return (
    <div className={`grid grid-cols-2 lg:grid-cols-4 gap-4 px-1 md:px-0 md:gap-2 lg:gap-3`}>
      {displayAuctions.map((auction) => {
        const favorite = isFavorite(auction.id);
        const auctionUrl = auction.url || ((auction.slug || auction.id) ? `/live_bid/${auction.slug || auction.id}` : '/ro');
        const address = auction.address || auction.location;
        const coords = auction.coordinates;
        const hasPlaceholderImage = !auction.image || String(auction.image).includes('placeholder');
        const showMap = (address || (coords?.lat != null && coords?.lng != null)) && hasPlaceholderImage;
        // Exact ca pe /ro: getDisplayCity(location) || location
        const displayLocation = (getDisplayCity(auction.location) || auction.location || '').trim() || 'neprecizată';
        const condition = auction.condition;

        return (
          <div
            key={auction.id}
            role="button"
            tabIndex={0}
            onClick={() => { window.location.href = auctionUrl; }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.location.href = auctionUrl; } }}
            className={`group backdrop-blur-lg rounded-xl shadow-xl overflow-hidden transition-all duration-300 border hover:shadow-2xl cursor-pointer ${
              isDarkMode
                ? 'bg-white/10 border-white/20'
                : 'bg-white border-gray-200'
            }`}
          >
            {/* Image – același bloc ca pe /ro */}
            <div className={`relative h-48 md:h-64 border ${isDarkMode ? 'border-gray-600' : 'border-white'}`}>
              {showMap ? (
                <div className="h-full w-full" onClick={(e) => e.stopPropagation()}>
                  <PropertyMap
                    address={address || undefined}
                    coordinates={coords ?? undefined}
                    height="h-full"
                  />
                </div>
              ) : (
                <Image
                  src={auction.image}
                  alt=""
                  fill
                  sizes="(max-width: 768px) 50vw, 25vw"
                  className="object-cover object-center"
                  loading="lazy"
                />
              )}
              {/* Badge PREMIUM – exact ca pe /ro */}
              <div className="absolute top-1 left-1 md:top-2 md:left-2 flex flex-col gap-1">
                <PieseAutoMarcaInlineSpan listing={auction} />
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-extrabold tracking-wide text-white shadow-lg border border-yellow-300/50 bg-gradient-to-r from-yellow-500 via-amber-500 to-orange-500">
                  <i className="ri-vip-crown-2-line text-xs"></i>
                  PREMIUM
                </span>
              </div>
              {/* Heart – exact ca pe /ro */}
              <div className="absolute top-1 right-1 md:top-2 md:right-2 flex space-x-0.5">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onToggleFavorite(auction.id); }}
                  className={`gobid-heart-bounce p-0.5 rounded-full transition-all duration-300 shadow hover:shadow-md ${
                    favorite
                      ? 'bg-red-600 text-white hover:bg-red-700'
                      : isDarkMode
                        ? 'bg-white/30 backdrop-blur-md text-red-300 hover:bg-white/40 ring-1 ring-white/20'
                        : 'bg-white/85 backdrop-blur-md text-red-600 hover:bg-white ring-1 ring-black/10'
                  }`}
                  title={favorite ? 'Elimină din favorite' : 'Adaugă la favorite'}
                >
                  <HeartIcon
                    size="m"
                    className={
                      favorite
                        ? 'text-white fill-white'
                        : isDarkMode ? 'text-red-200 drop-shadow-lg' : 'text-red-600 drop-shadow-lg'
                    }
                    strokeWidth={1.75}
                  />
                </button>
              </div>
            </div>

            {/* Content – exact ca pe /ro (anunțuri useri: titlu, Nou/Uzat, preț, locație, Publicat) */}
            <div className="p-2 md:p-3">
              <div className="mb-1">
                <h3
                  className={`text-xs md:text-base font-semibold transition-colors ${isDarkMode ? 'text-white' : 'text-black'} line-clamp-2 group-hover:text-yellow-500 group-focus:text-yellow-500 group-active:text-yellow-500`}
                  title={auction.title}
                >
                  {auction.title}
                </h3>
                {/* Nou/Uzat – același badge ca pe restul site-ului */}
                <div className="flex items-center gap-1 mt-0.5">
                  <ProductConditionBadge
                    kind={isConditionNew(condition) ? 'nou' : 'uzat'}
                    isDarkMode={isDarkMode}
                  />
                </div>
              </div>

              {/* Preț – exact ca pe /ro (fără "Oferta:") */}
              <div className="mb-1 md:mb-1.5 block">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`text-xs md:text-sm font-semibold transition-colors ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    {auction.price}
                  </span>
                </div>
              </div>

              {/* Locație – exact ca pe /ro */}
              <div className="flex items-center space-x-1">
                <LocationIcon size="s" className="text-gray-500" />
                <span className={`text-xs transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{displayLocation}</span>
              </div>

              {/* Publicat – exact ca pe /ro */}
              {auction.createdAt && (
                <div className="mt-2 flex justify-end">
                  <span className={`text-xs transition-colors ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                    Publicat: {formatDate(auction.createdAt)}
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
