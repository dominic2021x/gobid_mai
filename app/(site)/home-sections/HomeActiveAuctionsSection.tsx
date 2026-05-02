"use client";

import Image from "next/image";
import { HeartIcon, LockClosedIcon, LockOpenIcon, LocationIcon, CoinsIcon } from "@/components/HeroIcons";
import AuctionListSkeleton from "@/components/skeletons/AuctionListSkeleton";
import { getProductDisplayImage } from "@/lib/getProductDisplayImage";
import type { HomeActiveAuction, HomeUserTokens } from "./types";

export interface HomeActiveAuctionsSectionProps {
  isDarkMode: boolean;
  isPageLoading: boolean;
  isLoadingActiveAuctions: boolean;
  activeAuctions: HomeActiveAuction[];
  userTokens: HomeUserTokens;
  isAuctionUnlocked: (id: string) => boolean;
  isAuctionFavorite: (id: string) => boolean;
  handleUnlockAuction: (id: string) => void;
  handleToggleFavorite: (id: string) => void;
}

function AuctionCountdown({ auction, isDarkMode }: { auction: HomeActiveAuction; isDarkMode: boolean }) {
  let days = 0,
    hours = 0,
    minutes = 0,
    seconds = 0;
  let isEnded = false;
  if (auction.auctionDate) {
    const auctionDate = new Date(auction.auctionDate);
    const now = new Date();
    const diffMs = auctionDate.getTime() - now.getTime();
    if (diffMs <= 0) isEnded = true;
    else {
      const totalSeconds = Math.floor(diffMs / 1000);
      days = Math.floor(totalSeconds / (24 * 3600));
      hours = Math.floor((totalSeconds % (24 * 3600)) / 3600);
      minutes = Math.floor((totalSeconds % 3600) / 60);
      seconds = totalSeconds % 60;
    }
  } else if (auction.timerSeconds) {
    const totalSeconds = auction.timerSeconds;
    days = Math.floor(totalSeconds / (24 * 3600));
    hours = Math.floor((totalSeconds % (24 * 3600)) / 3600);
    minutes = Math.floor((totalSeconds % 3600) / 60);
    seconds = totalSeconds % 60;
  }
  if (isEnded) {
    return (
      <span className="text-[10px] sm:text-xs font-semibold text-red-600">Licitația s-a încheiat</span>
    );
  }
  return (
    <div className="grid grid-cols-4 gap-0.5 sm:gap-1">
      {[
        { value: days, label: "Zile" },
        { value: hours, label: "Ore" },
        { value: minutes, label: "Min" },
        { value: seconds, label: "Sec" },
      ].map((item, idx) => (
        <div
          key={idx}
          className={`text-center rounded px-0.5 py-0.5 sm:px-1 sm:py-1 border min-w-0 ${
            isDarkMode ? "bg-gray-700/50 border-gray-600" : "bg-white/80 border-gray-200"
          }`}
        >
          <div className={`text-[10px] sm:text-xs font-bold leading-tight ${isDarkMode ? "text-white" : "text-gray-900"}`}>
            {String(item.value).padStart(2, "0")}
          </div>
          <div className={`text-[8px] sm:text-[9px] font-medium ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>
            {item.label}
          </div>
        </div>
      ))}
    </div>
  );
}

export function HomeActiveAuctionsSection({
  isDarkMode,
  isPageLoading,
  isLoadingActiveAuctions,
  activeAuctions,
  userTokens,
  isAuctionUnlocked,
  isAuctionFavorite,
  handleUnlockAuction,
  handleToggleFavorite,
}: HomeActiveAuctionsSectionProps) {
  if (isPageLoading || isLoadingActiveAuctions) {
    return (
      <section className={`-mt-2 sm:-mt-3 md:-mt-4 pt-0 sm:pt-1 md:pt-2 pb-8 sm:pb-12 md:pb-16 ${isDarkMode ? "" : "bg-gray-50/50"}`}>
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="text-left mb-3 sm:mb-5 md:mb-8">
            <h2 className={`text-lg sm:text-xl md:text-2xl font-bold ${isDarkMode ? "bg-gradient-to-r from-white via-gray-100 to-gray-200 bg-clip-text text-transparent" : "bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 bg-clip-text text-transparent"}`}>
              Executări și Insolvență
            </h2>
          </div>
          <AuctionListSkeleton count={4} viewMode="grid" isDarkMode={isDarkMode} />
        </div>
      </section>
    );
  }
  if (!activeAuctions || activeAuctions.length === 0) {
    return null;
  }
  return (
    <section className={`-mt-2 sm:-mt-3 md:-mt-4 pt-0 sm:pt-1 md:pt-2 pb-8 sm:pb-12 md:pb-16 ${isDarkMode ? "" : "bg-gray-50/50"}`}>
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="text-left mb-3 sm:mb-5 md:mb-8">
          <h2 className={`text-lg sm:text-xl md:text-2xl font-bold transition-colors duration-300 ${
            isDarkMode ? "bg-gradient-to-r from-white via-gray-100 to-gray-200 bg-clip-text text-transparent" : "bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 bg-clip-text text-transparent"
          }`}>
            Executări și Insolvență
          </h2>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 md:gap-6">
          {activeAuctions.map((auction) => {
            const unlocked = isAuctionUnlocked(auction.id);
            const favorite = isAuctionFavorite(auction.id);
            const tokenLabel = auction.tokenCost === 1 ? "1 Token" : `${auction.tokenCost} Tokeni`;
            const auctionUrl = auction.url || (auction.slug ? `/licitatii-publice/${auction.slug}` : "/ro");
            return (
              <div
                key={auction.id}
                role="button"
                tabIndex={0}
                onClick={() => { window.location.href = auctionUrl; }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    window.location.href = auctionUrl;
                  }
                }}
                className={`group rounded-lg md:rounded-xl shadow-lg md:shadow-xl overflow-hidden transition-all duration-300 border hover:shadow-2xl md:hover:scale-[1.02] cursor-pointer ${
                  isDarkMode ? "bg-white/10 border-white/20" : "bg-white border-gray-200"
                }`}
              >
                <div className={`relative h-32 sm:h-40 md:h-56 ${isDarkMode ? "border-gray-600" : "border-gray-100"} overflow-hidden`}>
                  <Image
                    src={getProductDisplayImage(auction)}
                    alt=""
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    className="object-cover object-center"
                    loading="lazy"
                  />
                  <div className="absolute top-1 left-1 md:top-2 md:left-2 flex flex-col gap-1">
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-extrabold tracking-wide text-white shadow-md border border-blue-300/40 bg-gradient-to-r from-blue-600 via-blue-600 to-sky-500">
                      <i className="text-xs ri-shield-star-line" aria-hidden />
                      Exclusiv
                    </span>
                  </div>
                  <div className="absolute top-1 right-1 sm:top-2 sm:right-2 flex items-center gap-0.5 sm:gap-1">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleToggleFavorite(auction.id); }}
                      className={`min-w-[44px] min-h-[44px] p-0.5 sm:p-1 rounded-full flex items-center justify-center transition-all shadow-md hover:shadow-lg ${
                        favorite ? "bg-gradient-to-r from-red-600 to-red-500 text-white" : isDarkMode ? "bg-white/30 backdrop-blur-md text-red-300" : "bg-white/85 backdrop-blur-md text-red-600"
                      }`}
                      title={favorite ? "Elimină din favorite" : "Adaugă la favorite"}
                      aria-label={favorite ? "Elimină din favorite" : "Adaugă la favorite"}
                    >
                      <HeartIcon size="m" className={favorite ? "text-white fill-white" : ""} strokeWidth={1.75} />
                    </button>
                    <div className={`px-1 sm:px-1.5 py-0.5 sm:py-1 rounded shadow-md border flex items-center justify-center ${
                      unlocked ? "bg-gradient-to-r from-green-600 to-green-500 text-white border-green-400" : "bg-gradient-to-r from-red-600 to-red-500 text-white border-red-400"
                    }`}>
                      {unlocked ? <LockOpenIcon size="s" className="text-white" strokeWidth={2} /> : <LockClosedIcon size="s" className="text-white" strokeWidth={2} />}
                    </div>
                  </div>
                </div>
                <div className="p-2 sm:p-3">
                  <h3 className={`text-xs sm:text-sm md:text-base font-semibold line-clamp-2 ${isDarkMode ? "text-white" : "text-black"}`} title={auction.title}>
                    {auction.title}
                  </h3>
                  <div className="flex items-center gap-0.5 sm:gap-1 mt-0.5 sm:mt-1">
                    <span className={`inline-flex items-center gap-0.5 px-0.5 sm:px-1 py-0.5 rounded text-[10px] sm:text-xs font-medium ${isDarkMode ? "bg-blue-500/20 text-blue-300 border border-blue-500/30" : "bg-blue-500/20 text-blue-800 border border-blue-500/30"}`}>
                      <i className="text-[10px] sm:text-xs ri-auction-line" aria-hidden />
                      Licitație Publică
                    </span>
                  </div>
                  <div className="mt-0.5 sm:mt-1.5 flex items-center gap-1 sm:gap-1.5">
                    <span className={`text-[10px] sm:text-xs ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>Oferta:</span>
                    <span className={`text-[10px] sm:text-xs md:text-sm font-semibold ${isDarkMode ? "text-white" : "text-gray-900"}`}>{auction.price}</span>
                  </div>
                  <div className="mt-0.5" suppressHydrationWarning>
                    <AuctionCountdown auction={auction} isDarkMode={isDarkMode} />
                  </div>
                  {!unlocked && (
                    <div className="mt-1 sm:mt-2 flex items-center justify-between gap-1">
                      <div className="flex items-center gap-0.5 min-w-0">
                        <CoinsIcon size="s" className="text-yellow-500 flex-shrink-0" />
                        <span className={`text-[10px] sm:text-xs font-medium truncate ${isDarkMode ? "text-yellow-400" : "text-yellow-600"}`}>{tokenLabel}</span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleUnlockAuction(auction.id); }}
                        className="px-1.5 py-1 sm:px-2.5 sm:py-1.5 bg-yellow-500 text-white rounded text-[10px] sm:text-xs font-medium hover:bg-yellow-600 transition-colors flex-shrink-0"
                      >
                        Deblochează
                      </button>
                    </div>
                  )}
                  <div className="mt-1 sm:mt-2 flex items-center gap-0.5 sm:gap-1 min-w-0">
                    <LocationIcon size="s" className={`flex-shrink-0 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`} />
                    <span className={`text-[10px] sm:text-xs truncate ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}>
                      {typeof auction.location === "string" ? auction.location.split(",")[0]?.trim() || auction.location : String(auction.location ?? "")}
                    </span>
                  </div>
                  <div className="mt-1 sm:mt-1.5 flex items-center justify-end text-[0.6rem] sm:text-[0.65rem] gap-1">
                    <span className={`flex items-center gap-0.5 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>
                      <CoinsIcon size="s" className="text-yellow-500" />
                      SOLD: {userTokens.balance}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
