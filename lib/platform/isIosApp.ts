type WindowWithCapacitor = Window & {
  Capacitor?: {
    isNativePlatform?: () => boolean;
    getPlatform?: () => string;
  };
};

/** Aplicația iOS din App Store (Capacitor). Folosit pentru IAP obligatoriu la bunuri digitale. */
export function isNativeCapacitorIos(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as WindowWithCapacitor).Capacitor;
  return Boolean(cap?.isNativePlatform?.() && cap.getPlatform?.() === 'ios');
}

export function isIosApp(): boolean {
  if (typeof window === 'undefined') return false;

  const cap = (window as WindowWithCapacitor).Capacitor;
  if (cap?.isNativePlatform?.() && cap.getPlatform?.() === 'ios') {
    return true;
  }

  const ua = window.navigator.userAgent || '';
  const isIosUa = /iPhone|iPad|iPod/i.test(ua);
  const hasWebKitBridge =
    typeof (window as Window & { webkit?: unknown }).webkit !== 'undefined' ||
    /\bwv\b/i.test(ua);

  return isIosUa && hasWebKitBridge;
}
