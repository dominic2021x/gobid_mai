"use client";

export interface HomeNewsletterSectionProps {
  isDarkMode: boolean;
  newsletterSubscribed: boolean;
  showNewsletterForm: boolean;
  setShowNewsletterForm: (v: boolean) => void;
  newsletterEmail: string;
  setNewsletterEmail: (v: string) => void;
  newsletterFullName: string;
  setNewsletterFullName: (v: string) => void;
  newsletterBirthDate: string;
  setNewsletterBirthDate: (v: string) => void;
  newsletterAcceptTerms: boolean;
  setNewsletterAcceptTerms: (v: boolean) => void;
  newsletterLoading: boolean;
  onNewsletterSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}

/**
 * Lazy-loaded newsletter CTA and form. Form/API deps load only with this chunk.
 * Intentionally lazy: below-the-fold; scripts/third-party not in critical path.
 */
export function HomeNewsletterSection({
  isDarkMode,
  newsletterSubscribed,
  showNewsletterForm,
  setShowNewsletterForm,
  newsletterEmail,
  setNewsletterEmail,
  newsletterFullName,
  setNewsletterFullName,
  newsletterBirthDate,
  setNewsletterBirthDate,
  newsletterAcceptTerms,
  setNewsletterAcceptTerms,
  newsletterLoading,
  onNewsletterSubmit,
}: HomeNewsletterSectionProps) {
  return (
    <section className={`mt-6 sm:mt-10 md:mt-16 py-6 sm:py-10 md:py-12 lg:py-16 border-t transition-all duration-300 ${isDarkMode ? "border-white/10" : "border-gray-200"}`}>
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center">
          <div className="flex items-center justify-center gap-2 sm:gap-4 mb-2 sm:mb-4">
            <div className="inline-flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 md:w-14 md:h-14 bg-gradient-to-r from-blue-500 to-blue-500 rounded-full shadow-2xl flex-shrink-0">
              <i className="ri-mail-send-line text-white text-base sm:text-xl md:text-2xl" aria-hidden />
            </div>
            <h2 className={`text-lg sm:text-2xl md:text-4xl font-bold bg-clip-text text-transparent transition-all duration-300 ${
              isDarkMode ? "bg-gradient-to-r from-blue-400 via-blue-400 to-pink-400" : "bg-gradient-to-r from-blue-600 via-blue-600 to-pink-600"
            }`}>
              Abonează-te la Newsletter
            </h2>
          </div>
          <p className={`text-xs sm:text-sm md:text-lg mb-1 sm:mb-2 transition-colors duration-300 ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}>
            Primește noutăți despre licitații exclusive, oferte speciale și evenimente
          </p>
          <div className={`inline-flex items-center gap-1.5 sm:gap-2 px-2 py-1 sm:px-4 sm:py-2 rounded md:rounded-lg mb-3 sm:mb-6 transition-all duration-300 ${
            isDarkMode ? "bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-400/30" : "bg-gradient-to-r from-green-100 to-emerald-100 border border-green-300"
          }`}>
            <i className="ri-gift-line text-green-500 text-sm sm:text-base flex-shrink-0" aria-hidden />
            <span className={`text-xs sm:text-sm font-semibold transition-colors duration-300 ${isDarkMode ? "text-green-300" : "text-green-700"}`}>
              5 tokens cadou dacă te înscrii la newsletter!
            </span>
          </div>
          {newsletterSubscribed ? (
            <div className={`rounded-lg p-3 sm:p-6 transition-all duration-300 ${
              isDarkMode ? "bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-400/30" : "bg-gradient-to-r from-green-100 to-emerald-100 border border-green-300"
            }`}>
              <div className="flex items-center justify-center gap-2 sm:gap-3 mb-2 sm:mb-4">
                <i className="ri-checkbox-circle-line text-green-500 text-xl sm:text-3xl flex-shrink-0" aria-hidden />
                <h3 className={`text-base sm:text-xl font-semibold transition-colors duration-300 ${isDarkMode ? "text-green-300" : "text-green-700"}`}>Te-ai abonat cu succes!</h3>
              </div>
              <p className={`text-xs sm:text-sm transition-colors duration-300 ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}>
                Verifică email-ul pentru codul tău de 5 tokeni cadou!
              </p>
              <p className={`text-xs sm:text-sm transition-colors duration-300 ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}>
                Vei primi noutăți despre licitații exclusive și oferte speciale.
              </p>
            </div>
          ) : !showNewsletterForm ? (
            <button
              type="button"
              onClick={() => setShowNewsletterForm(true)}
              className="px-4 py-2 sm:px-6 sm:py-3 md:px-8 md:py-4 bg-gradient-to-r from-blue-500 via-blue-500 to-blue-500 hover:from-blue-600 hover:via-blue-600 hover:to-blue-600 text-white text-sm sm:text-base font-semibold rounded-lg sm:rounded-xl transition-all duration-300 shadow-xl hover:shadow-2xl transform hover:scale-[1.02] active:scale-[0.98] relative overflow-hidden group"
            >
              <span className="relative z-10 flex items-center justify-center gap-1.5 sm:gap-2">
                <i className="ri-mail-send-line text-sm sm:text-base" aria-hidden />
                Abonează-te la Newsletter
              </span>
            </button>
          ) : (
            <form onSubmit={onNewsletterSubmit} className="max-w-md mx-auto space-y-2 sm:space-y-4">
              <div>
                <label className={`block text-xs sm:text-sm font-medium mb-1 sm:mb-2 ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>
                  Nume complet <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newsletterFullName}
                  onChange={(e) => setNewsletterFullName(e.target.value)}
                  placeholder="Nume complet"
                  className={`w-full px-3 py-2 sm:px-4 sm:py-3 text-sm sm:text-base backdrop-blur-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300 ${
                    isDarkMode ? "bg-white/10 border-white/20 text-white placeholder-gray-400" : "bg-white border-gray-300 text-gray-900 placeholder-gray-500"
                  }`}
                  required
                  disabled={newsletterLoading}
                />
              </div>
              <div>
                <label className={`block text-xs sm:text-sm font-medium mb-1 sm:mb-2 ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={newsletterEmail}
                  onChange={(e) => setNewsletterEmail(e.target.value)}
                  placeholder="Adresa ta de email"
                  className={`w-full px-3 py-2 sm:px-4 sm:py-3 text-sm sm:text-base backdrop-blur-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300 ${
                    isDarkMode ? "bg-white/10 border-white/20 text-white placeholder-gray-400" : "bg-white border-gray-300 text-gray-900 placeholder-gray-500"
                  }`}
                  required
                  disabled={newsletterLoading}
                />
              </div>
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  id="newsletterAcceptTerms"
                  checked={newsletterAcceptTerms}
                  onChange={(e) => setNewsletterAcceptTerms(e.target.checked)}
                  className={`mt-0.5 sm:mt-1 h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-600 rounded focus:ring-blue-500 flex-shrink-0 ${isDarkMode ? "bg-white/10 border-white/20" : "border-gray-300"}`}
                  required
                  disabled={newsletterLoading}
                />
                <label htmlFor="newsletterAcceptTerms" className={`text-xs sm:text-sm leading-snug sm:leading-relaxed cursor-pointer ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>
                  Sunt de acord cu <a href="/termeni" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">Termenii și Condițiile</a> și <a href="/politica-confidentialitate" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">Politica de confidențialitate</a> <span className="text-red-500">*</span>
                </label>
              </div>
              <div className="flex gap-2 sm:gap-3 pt-1 sm:pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowNewsletterForm(false);
                    setNewsletterFullName("");
                    setNewsletterBirthDate("");
                    setNewsletterEmail("");
                    setNewsletterAcceptTerms(false);
                  }}
                  disabled={newsletterLoading}
                  className={`flex-1 px-3 py-2 sm:px-4 sm:py-3 text-sm sm:text-base border rounded-lg font-medium transition-all duration-300 ${
                    isDarkMode ? "bg-white/10 border-white/20 text-white hover:bg-white/20" : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  Anulează
                </button>
                <button
                  type="submit"
                  disabled={newsletterLoading}
                  className="flex-1 px-4 py-2 sm:px-6 sm:py-3 text-sm sm:text-base bg-gradient-to-r from-blue-500 via-blue-500 to-blue-500 hover:from-blue-600 hover:via-blue-600 hover:to-blue-600 text-white font-semibold rounded-lg transition-all duration-300 shadow-xl hover:shadow-2xl transform hover:scale-[1.02] active:scale-[0.98] relative overflow-hidden group disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {newsletterLoading ? (
                    <span className="relative z-10 flex items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                      Se abonează...
                    </span>
                  ) : (
                    <span className="relative z-10 flex items-center justify-center gap-2">
                      <i className="ri-mail-send-line" aria-hidden />
                      Abonează-te
                    </span>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
