export function isNativeIOS(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } })
    .Capacitor;
  return cap?.getPlatform?.() === 'ios';
}

