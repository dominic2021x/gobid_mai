"use client";

/**
 * Banner reclama: Anunțurile de Licitații (1 Token).
 * Poți înlocui acest fișier sau conținutul lui când vrei o altă reclamă.
 */
export type AuctionsBannerProps = {
  isDarkMode?: boolean;
  onClose: () => void;
};

export default function AuctionsBanner({ isDarkMode = false, onClose }: AuctionsBannerProps) {
  return (
    <div className="mb-4 md:mb-8">
      <div
        className={`relative overflow-hidden rounded-2xl md:rounded-3xl p-4 md:p-8 lg:p-12 ${
          isDarkMode
            ? "bg-gradient-to-br from-gray-800 via-gray-900 to-gray-800 border border-gray-700/50"
            : "bg-gradient-to-br from-blue-50 via-white to-blue-50 border border-blue-100/50"
        }`}
      >
        <button
          onClick={onClose}
          className="absolute top-2 right-2 md:top-4 md:right-4 z-20 p-1.5 md:p-2 rounded-full transition-all duration-200 hover:bg-black/10 dark:hover:bg-white/10"
          aria-label="Închide banner"
        >
          <i className="ri-close-line text-2xl md:text-3xl font-bold text-black" />
        </button>
        <div className="absolute inset-0 opacity-5">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
              backgroundSize: "40px 40px",
            }}
          />
        </div>

        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-4 md:gap-6">
          <div className="flex items-center gap-3 md:gap-6 flex-1 w-full md:w-auto">
            <div className="relative flex-shrink-0 w-14 h-14 md:w-20 md:h-20 lg:w-24 lg:h-24 rounded-xl md:rounded-2xl shadow-xl flex items-center justify-center transform transition-transform hover:scale-105 bg-gradient-to-br from-blue-500 to-blue-600">
              <div className="absolute inset-0 bg-white/10 rounded-xl md:rounded-2xl backdrop-blur-sm" />
              <i className="ri-hammer-line text-2xl md:text-4xl lg:text-5xl text-white relative z-10 drop-shadow-lg" />
              <div className="absolute -inset-1 bg-gradient-to-r from-blue-400 to-blue-500 rounded-xl md:rounded-2xl blur opacity-30 animate-pulse" />
            </div>
            <div className="flex-1 min-w-0">
              <h2
                className={`text-xl md:text-3xl lg:text-4xl font-bold mb-1 md:mb-2 ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                Anunțurile de Licitații
              </h2>
              <p
                className={`text-sm md:text-base lg:text-lg ${
                  isDarkMode ? "text-gray-300" : "text-gray-600"
                }`}
              >
                Licitații publice și anunțuri verificate
              </p>
            </div>
          </div>

          <div
            className={`flex-shrink-0 w-full md:w-auto rounded-xl md:rounded-2xl p-3 md:p-4 lg:p-6 border backdrop-blur-sm ${
              isDarkMode
                ? "bg-gray-800/50 border-gray-700/50"
                : "bg-white/60 border-blue-200/50"
            }`}
          >
            <div className="flex items-center gap-2 md:gap-3 mb-1 md:mb-2">
              <div
                className={`w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl flex items-center justify-center flex-shrink-0 ${
                  isDarkMode ? "bg-yellow-500/20" : "bg-yellow-100"
                }`}
              >
                <i
                  className={`ri-coins-line text-base md:text-xl ${
                    isDarkMode ? "text-yellow-400" : "text-yellow-600"
                  }`}
                />
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className={`text-xs font-medium ${
                    isDarkMode ? "text-gray-400" : "text-gray-500"
                  }`}
                >
                  Deblochează cu
                </p>
                <p
                  className={`text-base md:text-lg font-bold ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  1 Token
                </p>
              </div>
            </div>
            <p
              className={`text-xs ${
                isDarkMode ? "text-gray-400" : "text-gray-600"
              }`}
            >
              Accesează informații complete
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
