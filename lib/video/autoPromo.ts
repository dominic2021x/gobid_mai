/**
 * Auto-Promovare Video - Sistem complet de generare și postare automată
 * Generează zilnic clipuri video cu avatar AI în limba română
 */

import { generateAvatarScript } from './avatarScript';
import { generateVoiceAudio, saveVoiceAudio } from './elevenlabs';
import { generateHeyGenVideo, downloadHeyGenVideo } from './heygen';
import { mergeAvatarVideo } from './videoMerge';
import { join } from 'path';
import { mkdir } from 'fs/promises';

export interface ProductData {
  id?: string;
  title: string;
  description?: string;
  price?: number;
  category?: string;
  location?: string;
  features?: string[];
  images?: string[];
  url?: string;
}

export interface AutoPromoOptions {
  platform?: 'tiktok' | 'reels' | 'shorts' | 'all';
  provider?: 'heygen' | 'synthesia';
  avatarName?: string;
  autoUpload?: boolean;
  logoPath?: string;
}

export interface AutoPromoResult {
  success: boolean;
  video: {
    url: string;
    path: string;
    duration: number;
    platform: string;
  };
  script: {
    narration: string;
    hashtags: string[];
    callToAction: string;
  };
  upload?: any;
  error?: string;
  errorType?: string;
  errorDetails?: {
    message?: string;
    stack?: string;
    cause?: any;
  };
}

/**
 * Generează un clip video cu avatar AI pentru un produs
 */
export async function generateAutoPromoVideo(
  product: ProductData,
  options: AutoPromoOptions = {}
): Promise<AutoPromoResult> {
  const {
    platform = 'tiktok',
    provider = 'heygen',
    avatarName = 'Ana',
    autoUpload = false,
    logoPath,
  } = options;

  try {
    // Step 1: Generate script in Romanian
    console.log('📝 Generating Romanian script...');
    // Convert 'all' to 'tiktok' as default platform for script generation
    const scriptPlatform: 'tiktok' | 'reels' | 'shorts' = platform === 'all' ? 'tiktok' : platform;
    const script = await generateAvatarScript(product, scriptPlatform, avatarName);
    console.log('✅ Script generated:', script.narration.substring(0, 50) + '...');

    // Step 2: Generate Romanian voice with ElevenLabs
    console.log('🎙️ Generating Romanian voice...');
    const audioBuffer = await generateVoiceAudio(script.narration, {
      voiceId: process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL', // Romanian female
    });
    const audioFilename = `avatar_audio_ro_${Date.now()}.mp3`;
    const audioPath = await saveVoiceAudio(audioBuffer, audioFilename);
    console.log('✅ Romanian voice generated:', audioPath);

    // Step 3: Generate avatar video with HeyGen
    console.log(`🎬 Generating avatar video with ${provider} (Romanian)...`);
    
    let avatarVideoUrl: string;
    let avatarVideoPath: string;

    // Upload audio to publicly accessible URL (for HeyGen)
    const audioUrl = process.env.NEXT_PUBLIC_SITE_URL
      ? `${process.env.NEXT_PUBLIC_SITE_URL}/videos/audio/${audioFilename}`
      : undefined;

    if (provider === 'heygen') {
      if (!process.env.HEYGEN_API_KEY) {
        throw new Error('HEYGEN_API_KEY is not configured');
      }

      // Avatar ID will be fetched automatically if not configured
      const heygenVideo = await generateHeyGenVideo(
        script.narration,
        audioUrl,
        {
          avatarId: process.env.HEYGEN_AVATAR_ID || process.env.AVATAR_ID, // Will use default if not set
          aspectRatio: '9:16',
        }
      );

      // Check if video is still processing
      if (heygenVideo.status === 'processing' && !heygenVideo.videoUrl) {
        console.warn('⚠️  HeyGen video is still processing. Video ID:', heygenVideo.videoId);
        console.warn('💡 Video generation may take several minutes. Please check status later.');
        throw new Error(`Video generation is still in progress. Video ID: ${heygenVideo.videoId}. Please check status later or wait for completion.`);
      }

      if (!heygenVideo.videoUrl) {
        throw new Error(`HeyGen video URL not available. Status: ${heygenVideo.status}, Video ID: ${heygenVideo.videoId}`);
      }

      avatarVideoUrl = heygenVideo.videoUrl;
      console.log('✅ HeyGen video URL obtained:', avatarVideoUrl);
    } else {
      throw new Error('Only HeyGen provider is currently supported');
    }

    // Step 4: Download avatar video
    const videosDir = join(process.cwd(), 'public', 'videos', 'avatars');
    await mkdir(videosDir, { recursive: true });

    const avatarFilename = `avatar_ro_${Date.now()}_${provider}.mp4`;
    avatarVideoPath = join(videosDir, avatarFilename);

    await downloadHeyGenVideo(avatarVideoUrl, avatarVideoPath);
    console.log('✅ Avatar video downloaded:', avatarVideoPath);

    // Step 5: Merge with logo, Romanian subtitles, and effects
    console.log('🎞️ Merging video with Romanian subtitles and logo...');
    
    // Use specific filename for test video
    const isTestVideo = product.title.includes('test') || product.id === 'test-001';
    const finalFilename: string = isTestVideo 
      ? 'test-apartament.mp4'
      : `final_${avatarFilename}`;
    const finalVideoPath = join(videosDir, finalFilename);

    const defaultLogo = logoPath || join(process.cwd(), 'public', 'images', 'logo.png');
    const { existsSync } = await import('fs');

    // Try to merge video with subtitles and logo, but use raw video as fallback
    try {
      await mergeAvatarVideo({
        avatarVideoPath,
        logoPath: existsSync(defaultLogo) ? defaultLogo : undefined,
        subtitles: script.subtitles,
        outputPath: finalVideoPath,
        addIntro: false, // Disable intro/outro for now (FFmpeg issues)
        addOutro: false,
        outroText: script.callToAction || 'Vizitează Gobid.ro pentru mai multe anunțuri!',
      });
      console.log('✅ Final video merged with subtitles and logo:', finalVideoPath);
    } catch (mergeError: any) {
      console.error('❌ Video merge failed:', mergeError.message);
      console.warn('⚠️  Using raw HeyGen video as fallback (without subtitles/logo)');
      
      // Use raw video as fallback
      const { copyFile } = await import('fs/promises');
      try {
        await copyFile(avatarVideoPath, finalVideoPath);
        console.log('✅ Using raw avatar video (fallback):', finalVideoPath);
      } catch (copyError: any) {
        console.error('❌ Failed to copy raw video:', copyError);
        throw new Error(`Video merge failed and fallback copy failed: ${mergeError.message}`);
      }
    }

    // Step 6: Auto-upload if requested
    let uploadResults = null;
    if (autoUpload) {
      console.log('📤 Auto-uploading to social media...');
      try {
        const uploadResponse = await fetch(
          `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/avatar/upload`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              videoPath: `/videos/avatars/${finalFilename}`,
              platform,
              title: product.title,
              description: script.narration,
              hashtags: script.hashtags,
            }),
          }
        );

        if (uploadResponse.ok) {
          uploadResults = await uploadResponse.json();
        }
      } catch (error) {
        console.error('Upload error:', error);
      }
    }

    // Use the same finalFilename for video URL
    const videoUrl = `/videos/avatars/${finalFilename}`;

    return {
      success: true,
      video: {
        url: videoUrl,
        path: finalVideoPath,
        duration: script.duration,
        platform,
      },
      script: {
        narration: script.narration,
        hashtags: script.hashtags,
        callToAction: script.callToAction,
      },
      upload: uploadResults || undefined,
    };
  } catch (error: any) {
    console.error('❌ Auto-promo video generation error:', error);
    console.error('Error stack:', error.stack);
    console.error('Error details:', {
      message: error.message,
      name: error.name,
      cause: error.cause,
    });

    // Return detailed error information
    const errorMessage = error.message || 'Failed to generate video';
    const errorType = error.name || 'Error';

    return {
      success: false,
      video: {
        url: '',
        path: '',
        duration: 0,
        platform: platform,
      },
      script: {
        narration: '',
        hashtags: [],
        callToAction: '',
      },
      error: errorMessage,
      errorType: errorType,
      errorDetails: process.env.NODE_ENV === 'development' ? {
        message: error.message,
        stack: error.stack,
        cause: error.cause,
      } : undefined,
    };
  }
}

/**
 * Găsește cel mai vizualizat produs pentru promovare
 */
export async function getMostViewedProduct(): Promise<ProductData | null> {
  try {
    // Pentru server-side, încarcă din filesystem sau database
    // Pentru demo, folosim un produs sample
    return {
      id: '1',
      title: 'Apartament 3 camere Cluj-Napoca',
      description: 'Apartament modern, central, 3 camere, 2 băi, terasă',
      price: 150000,
      category: 'Imobiliare',
      location: 'Cluj-Napoca',
      features: ['Central', 'Modern', 'Terasă'],
    };

    // Încarcă produsele din localStorage sau database (pentru client-side)
    // if (typeof window !== 'undefined') {
    //   const productsJson = localStorage.getItem('products');
    //   if (productsJson) {
    //     const products: ProductData[] = JSON.parse(productsJson);
    //     
    //     // Sortează după vizualizări sau data creării
    //     const sortedProducts = products
    //       .filter(p => (p as any).status === 'active')
    //       .sort((a, b) => {
    //         // Prioritizează produsele noi
    //         return new Date((b as any).createdAt || 0).getTime() - new Date((a as any).createdAt || 0).getTime();
    //       });

    //     return sortedProducts[0] || null;
    //   }
    // }

    // Fallback: return null pentru server-side
    // return null;
  } catch (error) {
    console.error('Error getting most viewed product:', error);
    return null;
  }
}

/**
 * Rulează procesul complet de auto-promovare zilnică
 */
export async function runDailyAutoPromo(
  options: AutoPromoOptions = {}
): Promise<AutoPromoResult[]> {
  const results: AutoPromoResult[] = [];

  try {
    // Step 1: Găsește produsele pentru promovare
    console.log('🔍 Finding products to promote...');
    
    // Pentru server-side, ar trebui să încărci din database
    // Pentru demo, folosim un produs sample
    const products: ProductData[] = [
      {
        id: '1',
        title: 'Apartament 3 camere Cluj-Napoca',
        description: 'Apartament modern, central, 3 camere, 2 băi, terasă',
        price: 150000,
        category: 'Imobiliare',
        location: 'Cluj-Napoca',
        features: ['Central', 'Modern', 'Terasă'],
      },
    ];

    // Step 2: Generează video pentru fiecare produs (max 1 pe zi)
    const productToPromote = products[0];
    if (productToPromote) {
      console.log(`📹 Generating video for: ${productToPromote.title}`);
      
      const result = await generateAutoPromoVideo(productToPromote, {
        ...options,
        autoUpload: options.autoUpload !== false, // Default true pentru cron
      });

      results.push(result);
    }

    return results;
  } catch (error: any) {
    console.error('Daily auto-promo error:', error);
    return results;
  }
}

