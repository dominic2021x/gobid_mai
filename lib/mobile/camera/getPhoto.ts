/**
 * Centralized, production-safe image capture for iOS/Capacitor.
 * Prevents crashes on iPad/iPhone; graceful fallback when camera unavailable or permissions denied.
 */

import { logCameraFailure, logCameraSuccess } from '@/lib/logger/mobile';

export type SafePhotoResult =
  | {
      ok: true;
      webPath: string;
      format?: string | null;
      source: 'camera' | 'photos' | 'prompt';
    }
  | {
      ok: false;
      reason:
        | 'cancelled'
        | 'permission-denied'
        | 'unavailable'
        | 'plugin-missing'
        | 'unknown-error';
      message: string;
    };

export type GetSafePhotoOptions = {
  preferredSource?: 'camera' | 'photos' | 'prompt';
};

const CONTEXT = 'getSafePhoto';

function isNativePlatform(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  const platform = cap?.getPlatform?.();
  return platform === 'ios' || platform === 'android';
}

/**
 * Convert a Capacitor photo webPath (blob URL or capacitor URL) to a File for upload.
 * Use after getSafePhoto returns ok.
 */
export async function webPathToFile(
  webPath: string,
  defaultName = 'photo.jpg'
): Promise<File> {
  const res = await fetch(webPath);
  if (!res.ok) throw new Error('Failed to fetch photo');
  const blob = await res.blob();
  const ext = blob.type === 'image/png' ? 'png' : 'jpg';
  const name = defaultName.replace(/\.(jpe?g|png|webp)$/i, `.${ext}`);
  return new File([blob], name, { type: blob.type || 'image/jpeg' });
}

/**
 * Production-safe photo capture: single entry point for Take Photo / Choose from Library.
 * Uses @capacitor/camera on native; returns unavailable on web (UI should use file input).
 * Never throws; returns typed result. On iOS, prefers Prompt to avoid camera-only crash paths.
 */
export async function getSafePhoto(
  options?: GetSafePhotoOptions
): Promise<SafePhotoResult> {
  if (!isNativePlatform()) {
    return {
      ok: false,
      reason: 'unavailable',
      message: 'Camera is available in the native app only.',
    };
  }

  try {
    const { Camera, CameraSource, CameraResultType } = await import(
      '@capacitor/camera'
    );
    const { Capacitor } = await import('@capacitor/core');

    if (!Capacitor?.isPluginAvailable?.('Camera')) {
      logCameraFailure(CONTEXT, 'plugin-missing', 'Camera plugin not available');
      return {
        ok: false,
        reason: 'plugin-missing',
        message: 'Camera plugin is not available.',
      };
    }

    const platform = Capacitor.getPlatform();
    const preferred = options?.preferredSource ?? 'prompt';

    let source: 'CAMERA' | 'PHOTOS' | 'PROMPT';
    if (preferred === 'photos') {
      source = 'PHOTOS';
    } else if (preferred === 'camera') {
      source = 'CAMERA';
    } else {
      source = 'PROMPT';
    }

    // Solicită explicit permisiunile înainte de getPhoto.
    // Pe iOS, dacă apelăm doar checkPermissions și statusul e "prompt", sistemul NU afișează
    // fereastra de aprobare — trebuie requestPermissions() ca utilizatorul să vadă dialogul.
    try {
      const needCamera = source === 'CAMERA' || source === 'PROMPT';
      const needPhotos = source === 'PHOTOS' || source === 'PROMPT';
      const permissions: ('camera' | 'photos')[] = [];
      if (needCamera) permissions.push('camera');
      if (needPhotos) permissions.push('photos');

      if (permissions.length > 0) {
        const requested = await Camera.requestPermissions({ permissions });
        const photosOk =
          !needPhotos ||
          requested.photos === 'granted' ||
          requested.photos === 'limited';
        const cameraOk = !needCamera || requested.camera === 'granted';
        if (!cameraOk || !photosOk) {
          logCameraFailure(CONTEXT, 'permission-denied', 'User denied permission');
          return {
            ok: false,
            reason: 'permission-denied',
            message:
              'Permisiunea pentru cameră sau galerie a fost refuzată. O poți activa din Setări → gobid.ro.',
          };
        }
      }
    } catch (permErr) {
      logCameraFailure(
        CONTEXT,
        'permission-denied',
        permErr instanceof Error ? permErr.message : String(permErr)
      );
      return {
        ok: false,
        reason: 'permission-denied',
        message: 'Nu s-au putut solicita permisiunile pentru cameră/galerie.',
      };
    }

    const photo = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.Uri,
      presentationStyle: 'fullscreen',
      source:
        source === 'PROMPT'
          ? CameraSource.Prompt
          : source === 'CAMERA'
            ? CameraSource.Camera
            : CameraSource.Photos,
      promptLabelHeader: 'Foto',
      promptLabelCancel: 'Anulare',
      promptLabelPhoto: 'Din galerie',
      promptLabelPicture: 'Fă o poză',
    });

    if (!photo?.webPath) {
      return {
        ok: false,
        reason: 'unknown-error',
        message: 'Nu s-a putut obține imaginea.',
      };
    }

    const sourceLabel =
      source === 'PROMPT' ? 'prompt' : source === 'CAMERA' ? 'camera' : 'photos';
    logCameraSuccess(CONTEXT, sourceLabel);

    return {
      ok: true,
      webPath: photo.webPath,
      format: photo.format ?? null,
      source: sourceLabel,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isCancel =
      /cancel|abort|user denied|permision/i.test(msg) || msg === 'User cancelled photos app';

    if (isCancel) {
      return {
        ok: false,
        reason: 'cancelled',
        message: 'Ai anulat selecția.',
      };
    }

    logCameraFailure(CONTEXT, 'unknown-error', msg);
    return {
      ok: false,
      reason: 'unknown-error',
      message: 'A apărut o eroare. Poți încerca din galerie.',
    };
  }
}
