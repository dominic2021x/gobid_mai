"use client";

interface AuthRequiredModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode?: boolean;
  message?: string;
}

export default function AuthRequiredModal({
  isOpen,
  onClose,
  isDarkMode = false,
  message = "Trebuie să fii autentificat pentru a accesa această funcționalitate."
}: AuthRequiredModalProps) {
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
          isDarkMode 
            ? 'bg-gray-800 border-gray-700' 
            : 'bg-white border-gray-200'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className={`absolute top-1.5 right-1.5 md:top-4 md:right-4 p-1 md:p-2 rounded-full transition-colors ${
            isDarkMode 
              ? 'hover:bg-gray-700 text-gray-400 hover:text-white' 
              : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'
          }`}
        >
          <i className="ri-close-line text-base md:text-xl"></i>
        </button>

        {/* Modal Body */}
        <div className="p-3 md:p-8">
          {/* Icon */}
          <div className="flex justify-center mb-2 md:mb-4">
            <div className={`w-10 h-10 md:w-16 md:h-16 rounded-full flex items-center justify-center ${
              isDarkMode 
                ? 'bg-red-500/20' 
                : 'bg-red-100'
            }`}>
              <i className="ri-lock-line text-xl md:text-3xl text-red-500"></i>
            </div>
          </div>

          {/* Title */}
          <h3 className={`text-base md:text-2xl font-bold text-center mb-1 md:mb-2 ${
            isDarkMode ? 'text-white' : 'text-gray-900'
          }`}>
            Autentificare necesară
          </h3>

          {/* Message */}
          <p className={`text-xs md:text-base text-center mb-3 md:mb-6 leading-relaxed ${
            isDarkMode ? 'text-gray-300' : 'text-gray-600'
          }`}>
            {message}
          </p>

          {/* Buttons */}
          <div className="flex flex-col sm:flex-row gap-2 md:gap-3">
            <button
              onClick={onClose}
              className={`flex-1 px-3 md:px-4 py-1.5 md:py-2.5 rounded-md md:rounded-lg font-medium transition-colors text-xs md:text-base ${
                isDarkMode 
                  ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Anulează
            </button>
            <button
              onClick={() => {
                onClose();
                window.location.href = '/auth?mode=login';
              }}
              className="flex-1 px-3 md:px-4 py-1.5 md:py-2.5 rounded-md md:rounded-lg font-medium bg-gradient-to-r from-blue-600 to-blue-500 text-white hover:from-blue-700 hover:to-blue-600 transition-all shadow-lg hover:shadow-xl text-xs md:text-base"
            >
              Autentifică-te
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

