"use client";

interface DeleteAccountModalProps {
  isOpen: boolean;
  isDarkMode?: boolean;
  isLoading?: boolean;
  errorMessage?: string | null;
  onClose: () => void;
  onConfirm: () => void;
}

export default function DeleteAccountModal({
  isOpen,
  isDarkMode = false,
  isLoading = false,
  errorMessage = null,
  onClose,
  onConfirm,
}: DeleteAccountModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 md:p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Modal Content */}
      <div
        className={`relative w-full max-w-sm md:max-w-md rounded-lg md:rounded-2xl shadow-2xl border transform transition-all ${
          isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={isLoading}
          className={`absolute top-1.5 right-1.5 md:top-4 md:right-4 p-1 md:p-2 rounded-full transition-colors disabled:opacity-60 ${
            isDarkMode
              ? "hover:bg-gray-700 text-gray-400 hover:text-white"
              : "hover:bg-gray-100 text-gray-500 hover:text-gray-700"
          }`}
        >
          <i className="ri-close-line text-base md:text-xl"></i>
        </button>

        <div className="p-3 md:p-8">
          {/* Icon */}
          <div className="flex justify-center mb-2 md:mb-4">
            <div
              className={`w-10 h-10 md:w-16 md:h-16 rounded-full flex items-center justify-center ${
                isDarkMode ? "bg-red-500/20" : "bg-red-100"
              }`}
            >
              <i className="ri-error-warning-line text-xl md:text-3xl text-red-500"></i>
            </div>
          </div>

          <h3
            className={`text-base md:text-2xl font-bold text-center mb-1 md:mb-2 ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            Ești sigur că vrei să ștergi contul?
          </h3>

          <p
            className={`text-xs md:text-sm font-semibold text-center mb-2 ${
              isDarkMode ? "text-red-300" : "text-red-700"
            }`}
          >
            Contul va fi șters permanent.
          </p>

          <p
            className={`text-xs md:text-sm text-center mb-3 md:mb-6 leading-relaxed ${
              isDarkMode ? "text-gray-300" : "text-gray-600"
            }`}
          >
            Această acțiune nu poate fi anulată. Vei pierde accesul la cont, profil, anunțuri, favorite și conversații. Procesarea este imediată – vei fi deconectat instant.
          </p>

          {errorMessage ? (
            <div
              className={`mb-3 md:mb-6 rounded-md md:rounded-lg border px-3 py-2 text-xs md:text-sm ${
                isDarkMode
                  ? "bg-red-500/10 border-red-400/30 text-red-200"
                  : "bg-red-50 border-red-200 text-red-700"
              }`}
            >
              {errorMessage}
            </div>
          ) : null}

          <div className="flex flex-col sm:flex-row gap-2 md:gap-3">
            <button
              onClick={onClose}
              disabled={isLoading}
              className={`flex-1 px-3 md:px-4 py-1.5 md:py-2.5 rounded-md md:rounded-lg font-medium transition-colors text-xs md:text-base disabled:opacity-60 ${
                isDarkMode
                  ? "bg-gray-700 text-gray-200 hover:bg-gray-600"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Anulează
            </button>
            <button
              onClick={onConfirm}
              disabled={isLoading}
              className="flex-1 px-3 md:px-4 py-1.5 md:py-2.5 rounded-md md:rounded-lg font-medium bg-gradient-to-r from-red-600 to-red-500 text-white hover:from-red-700 hover:to-red-600 transition-all shadow-lg hover:shadow-xl text-xs md:text-base disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isLoading ? "Se procesează..." : "Șterge contul"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

