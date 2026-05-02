import { Capacitor } from '@capacitor/core';

type CameraSourceType = 'camera' | 'photos' | 'prompt';

export type TakePhotoSafeOptions = {
  preferredSource?: CameraSourceType;
};

export type TakePhotoSafeResult =
  | {
      ok: true;
      webPath: string;
      format?: string | null;
      source: CameraSourceType;
    }
  | {
      ok: false;
      reason: 'cancelled' | 'permission-denied' | 'unavailable' | 'plugin-missing' | 'unknown-error';
      message: string;
    };

function isNativeIos(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const platform = Capacitor.getPlatform?.();
    return platform === 'ios';
  } catch {
    return false;
  }
}

async function isIpad(): Promise<boolean> {
  if (!isNativeIos()) return false;

  try {
    const { Device } = await import('@capacitor/device');
    const info = await Device.getInfo();
    if (info.model && /ipad/i.test(info.model)) return true;
  } catch {
    // ignore and fallback to UA check
  }

  if (typeof navigator !== 'undefined') {
    const ua = navigator.userAgent || '';
    if (/iPad/.test(ua)) return true;
  }

  return false;
}

export async function takePhotoSafe(
  options?: TakePhotoSafeOptions
): Promise<TakePhotoSafeResult> {
  const preferred = options?.preferredSource ?? 'prompt';

  try {
    const { Camera, CameraSource, CameraResultType } = await import('@capacitor/camera');

    if (!Capacitor.isPluginAvailable?.('Camera')) {
      return {
        ok: false,
        reason: 'plugin-missing',
        message: 'Camera plugin nu este disponibil pe acest dispozitiv.',
      };
    }

    const platform = Capacitor.getPlatform();
    let effectiveSource: CameraSourceType = preferred;

    // On iPad, always use Prompt to avoid camera presentation crashes
    if (platform === 'ios' && (await isIpad())) {
      effectiveSource = 'prompt';
    }

    // Map logical source to Capacitor CameraSource
    const capSource =
      effectiveSource === 'prompt'
        ? CameraSource.Prompt
        : effectiveSource === 'camera'
          ? CameraSource.Camera
          : CameraSource.Photos;

    const needCamera = effectiveSource === 'camera' || effectiveSource === 'prompt';
    const needPhotos = effectiveSource === 'photos' || effectiveSource === 'prompt';
    const permissions: ('camera' | 'photos')[] = [];
    if (needCamera) permissions.push('camera');
    if (needPhotos) permissions.push('photos');

    if (permissions.length > 0) {
      try {
        const requested = await Camera.requestPermissions({ permissions });
        const photosOk =
          !needPhotos ||
          requested.photos === 'granted' ||
          requested.photos === 'limited';
        const cameraOk = !needCamera || requested.camera === 'granted';
        if (!cameraOk || !photosOk) {
          return {
            ok: false,
            reason: 'permission-denied',
            message:
              'Permisiunea pentru cameră sau galerie a fost refuzată. O poți activa din Setări → gobid.ro.',
          };
        }
      } catch {
        return {
          ok: false,
          reason: 'permission-denied',
          message: 'Nu s-au putut solicita permisiunile pentru cameră/galerie.',
        };
      }
    }

    const photo = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.Uri,
      source: capSource,
      presentationStyle: 'fullscreen',
    });

    if (!photo?.webPath) {
      return {
        ok: false,
        reason: 'unknown-error',
        message: 'Nu s-a putut obține fotografia.',
      };
    }

    return {
      ok: true,
      webPath: photo.webPath,
      format: photo.format ?? null,
      source: effectiveSource,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isCancel =
      /cancel|abort|user denied|permission|denied/i.test(msg) ||
      msg === 'User cancelled photos app';

    if (isCancel) {
      return {
        ok: false,
        reason: 'cancelled',
        message: 'Ai anulat selecția.',
      };
    }

    if (/not available|no camera|unavailable/i.test(msg)) {
      return {
        ok: false,
        reason: 'unavailable',
        message: 'Camera nu este disponibilă pe acest dispozitiv.',
      };
    }

    return {
      ok: false,
      reason: 'unknown-error',
      message: 'A apărut o eroare neașteptată la pornirea camerei.',
    };
  }
}

