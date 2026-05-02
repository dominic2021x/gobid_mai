"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { QRCodeSVG } from "qrcode.react";

interface ExecutorData {
  licitatorName?: string;
  licitatorAddress?: string;
  licitatorFiscalCode?: string;
  licitatorConsignmentAccount?: string;
  licitatorEmail?: string;
  licitatorPhone?: string;
  licitatorFax?: string;
  licitatorCompetence?: string;
  licitatorAvatar?: string;
}

interface ExecutorBusinessCardProps {
  executorData: ExecutorData;
  auctionId?: string;
  className?: string;
  isDarkMode?: boolean;
  /** Când false, telefonul și emailul rămân mascate; la click se afișează notificare de deblocare */
  isUnlocked?: boolean;
}

const UNLOCK_TOAST_DURATION_MS = 1500;

export default function ExecutorBusinessCard({ 
  executorData, 
  auctionId,
  className = "",
  isDarkMode = false,
  isUnlocked = true
}: ExecutorBusinessCardProps) {
  const [showFullPhone, setShowFullPhone] = useState(false);
  const [showFullEmail, setShowFullEmail] = useState(false);
  const [showFullAddress, setShowFullAddress] = useState(false);
  const [showFullName, setShowFullName] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [showUnlockToast, setShowUnlockToast] = useState(false);

  // O dată deblocat anunțul, afișăm toate detaliile (fără stelute), fără click
  useEffect(() => {
    if (isUnlocked) {
      setShowFullName(true);
      setShowFullPhone(true);
      setShowFullEmail(true);
      setShowFullAddress(true);
    }
  }, [isUnlocked]);

  useEffect(() => {
    if (!showUnlockToast) return;
    const t = setTimeout(() => setShowUnlockToast(false), UNLOCK_TOAST_DURATION_MS);
    return () => clearTimeout(t);
  }, [showUnlockToast]);

  const formatAddress = (address: string) => {
    if (showFullAddress || address.length <= 10) return address;
    const visible = Math.min(10, address.length);
    return address.substring(0, visible) + '*'.repeat(address.length - visible);
  };

  const formatName = (name: string) => {
    if (showFullName || name.length <= 6) return name;
    const visible = Math.min(6, name.length);
    return name.substring(0, visible) + '*'.repeat(name.length - visible);
  };

  const copyToClipboard = async (text: string | undefined, type: 'phone' | 'email' | 'address') => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'phone') {
        setCopiedPhone(true);
        setTimeout(() => setCopiedPhone(false), 2000);
      } else if (type === 'email') {
        setCopiedEmail(true);
        setTimeout(() => setCopiedEmail(false), 2000);
      }
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Debug logging
  if (typeof window !== 'undefined') {
    console.log('[ExecutorBusinessCard] Executor data:', {
      hasAvatar: !!executorData?.licitatorAvatar,
      avatarUrl: executorData?.licitatorAvatar,
      executorData
    });
  }

  if (!executorData || (!executorData.licitatorName && !executorData.licitatorAddress && !executorData.licitatorEmail && !executorData.licitatorPhone)) {
    return null;
  }

  const formatPhone = (phone: string) => {
    if (showFullPhone || phone.length <= 3) {
      return phone;
    }
    const hiddenDigits = phone.length - 3;
    const asterisks = '*'.repeat(hiddenDigits);
    return phone.substring(0, 3) + asterisks;
  };

  const formatEmail = (email: string) => {
    if (showFullEmail || email.length <= 3) {
      return email;
    }
    const atIndex = email.indexOf('@');
    if (atIndex === -1) {
      return '*'.repeat(Math.min(email.length, 10));
    }
    // Ascunde tot: local part + domeniu, lasă doar TLD (.com, .ro etc.)
    const afterAt = email.substring(atIndex + 1);
    const dotIndex = afterAt.lastIndexOf('.');
    const tld = dotIndex >= 0 ? afterAt.substring(dotIndex) : '.com';
    return `***@***${tld}`;
  };

  // Notificarea e afișată inline deasupra Telefon/Email, nu ca portal
  const unlockToast = null;

  return (
    <>
    <div className={`relative overflow-hidden shadow-xl rounded-lg w-full max-w-full box-border ${
      isDarkMode 
        ? 'bg-gradient-to-br from-gray-800 via-gray-900 to-gray-950' 
        : 'bg-gradient-to-br from-white via-gray-50 to-gray-100'
    } ${className}`}>
      <div className="relative min-h-[120px] sm:min-h-[140px]">
        {/* Avatar - responsive: mai mic pe mobil */}
        <div className="absolute left-2 top-2 sm:left-3 sm:top-3 z-20">
          {executorData.licitatorAvatar ? (
            <div className={`relative z-10 w-12 h-12 sm:w-[67px] sm:h-[67px] rounded-full overflow-hidden ring-2 ${
              isDarkMode ? 'ring-white' : 'ring-gray-300'
            } shadow-lg bg-gray-200 flex-shrink-0`}>
              <img 
                src={executorData.licitatorAvatar} 
                alt={executorData.licitatorName || 'Licitator'} 
                className="w-full h-full object-cover rounded-full"
                onError={(e) => {
                  // Fallback to initials if image fails
                  const target = e.target as HTMLImageElement;
                  const parent = target.parentElement;
                  if (parent) {
                    parent.innerHTML = '';
                    const nameParts = (executorData.licitatorName || '').split(' ');
                    const initials = nameParts.length > 0 
                      ? `${nameParts[0][0] || ''}${nameParts[1]?.[0] || ''}`.toUpperCase()
                      : 'L';
                    const ringClass = isDarkMode ? 'ring-white' : 'ring-gray-300';
                    parent.className = `relative z-10 w-[67px] h-[67px] rounded-full overflow-hidden ring-2 ${ringClass} shadow-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center`;
                    parent.innerHTML = `<span class="text-sm font-bold text-white">${initials}</span>`;
                  }
                }}
              />
            </div>
          ) : (
            <div className={`relative z-10 w-12 h-12 sm:w-[67px] sm:h-[67px] rounded-full overflow-hidden ring-2 ${
              isDarkMode ? 'ring-white' : 'ring-gray-300'
            } shadow-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0`}>
              {executorData.licitatorName ? (
                (() => {
                  const nameParts = executorData.licitatorName.split(' ');
                  const initials = `${nameParts[0]?.[0] || ''}${nameParts[1]?.[0] || ''}`.toUpperCase();
                  return <span className="text-xs sm:text-sm font-bold text-white">{initials}</span>;
                })()
              ) : (
                <span className="text-xs sm:text-sm font-bold text-white">L</span>
              )}
            </div>
          )}
        </div>
        
        {/* Content Section - padding responsive la avatar */}
        <div className="relative flex flex-col min-w-0 pl-[56px] sm:pl-[88px] pt-2 sm:pt-3 pr-2 sm:pr-3">
          {/* Abstract wavy lines background - diagonal */}
          <div className={`absolute inset-0 overflow-hidden ${
            isDarkMode ? 'opacity-15' : 'opacity-10'
          }`}>
            <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">
              <defs>
                <pattern id={`waves-pattern-card-${isDarkMode ? 'dark' : 'light'}`} x="0" y="0" width="120" height="80" patternUnits="userSpaceOnUse">
                  <path d="M0,40 Q30,20 60,40 T120,40" stroke={isDarkMode ? "#ffffff" : "#4b5563"} strokeWidth="0.8" fill="none"/>
                  <path d="M0,50 Q30,30 60,50 T120,50" stroke={isDarkMode ? "#ffffff" : "#4b5563"} strokeWidth="0.8" fill="none"/>
                  <path d="M0,60 Q30,40 60,60 T120,60" stroke={isDarkMode ? "#ffffff" : "#4b5563"} strokeWidth="0.8" fill="none"/>
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill={`url(#waves-pattern-card-${isDarkMode ? 'dark' : 'light'})`} transform="rotate(-20 200 100) translate(-50 -30)"/>
            </svg>
          </div>
          
          {/* Top Section - Name and Competence */}
          <div className="relative z-10 pb-1">
            {/* Name with QR Code on the right */}
            {executorData.licitatorName && (
              <div className="mb-0 flex items-start sm:items-center justify-between gap-1.5 sm:gap-2 min-w-0">
                <button
                  type="button"
                  onClick={() => {
                    if (!isUnlocked) {
                      setShowUnlockToast(true);
                      return;
                    }
                    setShowFullName(!showFullName);
                  }}
                  className={`flex-1 min-w-0 text-left text-base sm:text-xl font-light tracking-wide leading-tight line-clamp-2 hover:opacity-90 transition-opacity underline decoration-dotted underline-offset-2 inline-flex items-center gap-1.5 ${
                    isDarkMode ? 'text-white' : 'text-gray-900'
                  }`}
                  title={!isUnlocked ? "Deblocați anunțul pentru detalii" : showFullName ? "Click pentru a ascunde" : "Click pentru a vedea numele complet"}
                >
                  {isUnlocked && showFullName ? (
                    <span className="break-words">{executorData.licitatorName}</span>
                  ) : (
                    <>
                      <span>{formatName(executorData.licitatorName)}</span>
                      <svg
                        className={`w-3.5 h-3.5 sm:w-4 sm:h-4 opacity-70 flex-shrink-0 ${
                          isDarkMode ? 'text-white' : 'text-gray-700'
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    </>
                  )}
                </button>
                {/* QR Code - mai mic pe mobil ca să încapă */}
                {typeof window !== 'undefined' && auctionId && (
                  <div className={`flex-shrink-0 p-0.5 sm:p-1 rounded-lg shadow-sm ${
                    isDarkMode ? 'bg-white' : 'bg-gray-100'
                  }`}>
                    <QRCodeSVG
                      value={`${window.location.origin}/card-vizita/${auctionId}`}
                      size={48}
                      level="H"
                      includeMargin={false}
                    />
                  </div>
                )}
              </div>
            )}
            
            {/* Competență (instead of General Manager) */}
            {executorData.licitatorCompetence && (
              <div className={`text-xs font-light mb-1 mt-0 ${
                isDarkMode ? 'text-white' : 'text-gray-700'
              }`}>
                {executorData.licitatorCompetence}
              </div>
            )}
          </div>
          
        </div>
        
        {/* Separator with star icon - Full width across entire card */}
        {(executorData.licitatorPhone || executorData.licitatorEmail || executorData.licitatorAddress) && (
          <div className="relative z-10 px-3 sm:px-4 my-2 sm:my-2.5">
            <div className="flex items-center gap-2">
              <div className={`flex-1 h-px ${
                isDarkMode ? 'bg-white' : 'bg-gray-400'
              }`}></div>
              <div className="w-2 h-2 relative flex-shrink-0">
                <svg className={`w-2 h-2 ${
                  isDarkMode ? 'text-white' : 'text-gray-600'
                }`} fill="currentColor" viewBox="0 0 12 12">
                  <path d="M6 0L7.5 4.5L12 6L7.5 7.5L6 12L4.5 7.5L0 6L4.5 4.5L6 0Z"/>
                </svg>
              </div>
              <div className={`flex-1 h-px ${
                isDarkMode ? 'bg-white' : 'bg-gray-400'
              }`}></div>
            </div>
          </div>
        )}
        
        {/* Contact Information - Full width, responsive padding */}
        <div className="relative z-10 px-3 sm:px-4 pb-3 sm:pb-4">
            {/* Notificare deblocare - deasupra Telefon/Email */}
            {showUnlockToast && (
              <div
                className={`mb-3 rounded-xl shadow-lg backdrop-blur-md px-4 py-3 text-center text-sm font-medium animate-fade-in ${
                  isDarkMode
                    ? 'bg-gray-800/60 text-white border border-white/20'
                    : 'bg-white/80 text-gray-800 border border-gray-300/50'
                }`}
                style={{ animationDuration: '0.3s' }}
                role="status"
                aria-live="polite"
              >
                Vă rugăm să deblocați anunțul pentru detalii
              </div>
            )}
            <div className={`space-y-1.5 text-xs sm:text-sm font-light break-words ${
              isDarkMode ? 'text-white' : 'text-gray-800'
            }`}>
              {executorData.licitatorPhone && (
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="flex-shrink-0 w-4 h-4">
                      <svg className={`w-4 h-4 opacity-80 ${
                        isDarkMode ? 'text-white' : 'text-gray-700'
                      }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                    </div>
                    <span className={`text-sm ${
                      isDarkMode ? 'text-white' : 'text-gray-700'
                    }`}>Telefon:</span>
                    <button
                      onClick={() => {
                        if (!isUnlocked) {
                          setShowUnlockToast(true);
                          return;
                        }
                        setShowFullPhone(!showFullPhone);
                      }}
                      className={`hover:opacity-80 transition-opacity text-base font-medium cursor-pointer text-left underline decoration-dotted underline-offset-2 inline-flex items-center gap-1 ${
                        isDarkMode ? 'text-white' : 'text-gray-900'
                      }`}
                      title={!isUnlocked ? "Deblocați anunțul pentru detalii" : showFullPhone ? "Click pentru a ascunde" : "Click pentru a vedea numărul complet"}
                    >
                      {isUnlocked && showFullPhone ? (
                        <span>{executorData.licitatorPhone}</span>
                      ) : (
                        <>
                          <span>{executorData.licitatorPhone.substring(0, 3)}{'*'.repeat(executorData.licitatorPhone.length - 3)}</span>
                          <svg 
                            className={`w-3.5 h-3.5 opacity-70 flex-shrink-0 ${
                              isDarkMode ? 'text-white' : 'text-gray-700'
                            }`} 
                            fill="none" 
                            stroke="currentColor" 
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </>
                      )}
                    </button>
                    {isUnlocked && showFullPhone && (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (executorData.licitatorPhone) {
                              copyToClipboard(executorData.licitatorPhone, 'phone');
                            }
                          }}
                          className="ml-1 hover:opacity-80 transition-opacity inline-flex items-center gap-1 text-sm"
                          title={copiedPhone ? "Copiat!" : "Copiază numărul"}
                        >
                          {copiedPhone ? (
                            <>
                              <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              <span className="text-green-400 text-xs">Copiat!</span>
                            </>
                          ) : (
                            <>
                              <svg className={`w-4 h-4 ${
                                isDarkMode ? 'text-white' : 'text-gray-900'
                              }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                              <span className={`text-xs ${
                                isDarkMode ? 'text-white' : 'text-gray-900'
                              }`}>Copy</span>
                            </>
                          )}
                        </button>
                        <a href={`tel:${executorData.licitatorPhone}`} className="ml-1 hover:opacity-80 transition-opacity" title="Apelare">
                          <svg className={`w-4 h-4 ${
                            isDarkMode ? 'text-white' : 'text-gray-900'
                          }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                        </a>
                      </>
                    )}
                  </div>
                  {/* GoBid Logo - pe același rând; next/image pentru livrare optimizată (PageSpeed) */}
                  <div className="flex-shrink-0 ml-auto relative h-5 w-20">
                    <Image
                      src={isDarkMode ? "/logo_alb.png" : "/logo_negru.png"}
                      alt="GoBid.ro Logo"
                      width={80}
                      height={20}
                      sizes="80px"
                      className="h-5 w-auto object-contain object-right opacity-90"
                      onError={() => {}}
                    />
                  </div>
                </div>
              )}
              {executorData.licitatorEmail && (
                <div className="flex items-center gap-2">
                  <div className="flex-shrink-0 w-4 h-4">
                    <svg className={`w-4 h-4 opacity-80 ${
                      isDarkMode ? 'text-white' : 'text-gray-700'
                    }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <span className={`text-sm ${
                    isDarkMode ? 'text-white' : 'text-gray-700'
                  }`}>Email:</span>
                  <button
                    onClick={() => {
                      if (!isUnlocked) {
                        setShowUnlockToast(true);
                        return;
                      }
                      setShowFullEmail(!showFullEmail);
                    }}
                    className={`hover:opacity-80 transition-opacity text-sm font-medium cursor-pointer text-left underline decoration-dotted underline-offset-2 inline-flex items-center gap-1 ${
                      isDarkMode ? 'text-white' : 'text-gray-900'
                    }`}
                    title={!isUnlocked ? "Deblocați anunțul pentru detalii" : showFullEmail ? "Click pentru a ascunde" : "Click pentru a vedea email-ul complet"}
                  >
                    {isUnlocked && showFullEmail ? (
                      <span>{executorData.licitatorEmail}</span>
                    ) : (
                      <>
                        <span>{formatEmail(executorData.licitatorEmail)}</span>
                        <svg 
                          className={`w-3.5 h-3.5 opacity-70 flex-shrink-0 ${
                            isDarkMode ? 'text-white' : 'text-gray-700'
                          }`} 
                          fill="none" 
                          stroke="currentColor" 
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      </>
                    )}
                  </button>
                  {isUnlocked && showFullEmail && (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          copyToClipboard(executorData.licitatorEmail, 'email');
                        }}
                        className="ml-1 hover:opacity-80 transition-opacity inline-flex items-center gap-1 text-sm"
                        title={copiedEmail ? "Copiat!" : "Copiază email-ul"}
                      >
                        {copiedEmail ? (
                          <>
                            <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            <span className="text-green-400 text-xs">Copiat!</span>
                          </>
                        ) : (
                          <>
                            <svg className={`w-4 h-4 ${
                              isDarkMode ? 'text-white' : 'text-gray-900'
                            }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            <span className={`text-xs ${
                              isDarkMode ? 'text-white' : 'text-gray-900'
                            }`}>Copy</span>
                          </>
                        )}
                      </button>
                      <a href={`mailto:${executorData.licitatorEmail}`} className="ml-1 hover:opacity-80 transition-opacity" title="Trimite email">
                        <svg className={`w-4 h-4 ${
                          isDarkMode ? 'text-white' : 'text-gray-900'
                        }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                      </a>
                    </>
                  )}
                </div>
              )}
              {executorData.licitatorFiscalCode && (
                <div className="flex items-center gap-2 text-xs opacity-90">
                  <div className="flex-shrink-0 w-4 h-4">
                    <svg className={`w-4 h-4 opacity-80 ${
                      isDarkMode ? 'text-white' : 'text-gray-700'
                    }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <span className={`text-sm ${
                    isDarkMode ? 'text-white' : 'text-gray-700'
                  }`}>CUI:</span>
                  <span className={`font-medium ${
                    isDarkMode ? 'text-white' : 'text-gray-900'
                  }`}>{executorData.licitatorFiscalCode}</span>
                </div>
              )}
              {executorData.licitatorAddress && (
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex-shrink-0 w-4 h-4">
                    <svg className={`w-4 h-4 opacity-80 ${
                      isDarkMode ? 'text-white' : 'text-gray-700'
                    }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <span className={`text-sm ${
                    isDarkMode ? 'text-white' : 'text-gray-700'
                  }`}>Adresă:</span>
                  <button
                    onClick={() => {
                      if (!isUnlocked) {
                        setShowUnlockToast(true);
                        return;
                      }
                      setShowFullAddress(!showFullAddress);
                    }}
                    className={`hover:opacity-80 transition-opacity text-sm font-medium cursor-pointer text-left underline decoration-dotted underline-offset-2 inline-flex items-center gap-1 break-words ${
                      isDarkMode ? 'text-white' : 'text-gray-900'
                    }`}
                    title={!isUnlocked ? "Deblocați anunțul pentru detalii" : showFullAddress ? "Click pentru a ascunde" : "Click pentru a vedea adresa completă"}
                  >
                    {isUnlocked && showFullAddress ? (
                      <span className="break-words whitespace-pre-line">{executorData.licitatorAddress}</span>
                    ) : (
                      <>
                        <span>{formatAddress(executorData.licitatorAddress)}</span>
                        <svg
                          className={`w-3.5 h-3.5 opacity-70 flex-shrink-0 ${
                            isDarkMode ? 'text-white' : 'text-gray-700'
                          }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      </>
                    )}
                  </button>
                </div>
              )}
              {executorData.licitatorConsignmentAccount && (
                <div className="flex items-center gap-2 text-xs opacity-90">
                  <div className="flex-shrink-0 w-4 h-4">
                    <svg className={`w-4 h-4 opacity-80 ${
                      isDarkMode ? 'text-white' : 'text-gray-700'
                    }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                    </svg>
                  </div>
                  <span className={`text-sm ${
                    isDarkMode ? 'text-white' : 'text-gray-700'
                  }`}>Cont:</span>
                  <span className={isDarkMode ? 'text-white' : 'text-gray-900'}>{executorData.licitatorConsignmentAccount}</span>
                </div>
              )}
              {executorData.licitatorFax && (
                <div className="flex items-center gap-2 text-xs opacity-90">
                  <div className="flex-shrink-0 w-4 h-4">
                    <svg className={`w-4 h-4 opacity-80 ${
                      isDarkMode ? 'text-white' : 'text-gray-700'
                    }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <span className={`text-sm ${
                    isDarkMode ? 'text-white' : 'text-gray-700'
                  }`}>Fax:</span>
                  <span className={isDarkMode ? 'text-white' : 'text-gray-900'}>{executorData.licitatorFax}</span>
                </div>
              )}
            </div>
          </div>
      </div>
    </div>
    </>
  );
}

