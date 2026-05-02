/**
 * API Route - Generare Clip Video din Idee
 * POST /api/video/idea
 * 
 * Primește o idee de clip (text) și generează automat:
 * 1. Scenariul video în limba română (GPT-4o)
 * 2. Vocea naturală (ElevenLabs)
 * 3. Clipul cu avatar (HeyGen)
 * 4. Salvează în Supabase
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateAvatarScript } from '@/lib/video/avatarScript';
import { generateVoiceAudio, saveVoiceAudio } from '@/lib/video/elevenlabs';
import { generateHeyGenVideo, downloadHeyGenVideo } from '@/lib/video/heygen';
import { mergeAvatarVideo } from '@/lib/video/videoMerge';
import { saveVideo } from '@/lib/db/videos';
import { supabaseAdmin, supabase } from '@/lib/supabase';
import { join } from 'path';
import { mkdir } from 'fs/promises';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export interface IdeaVideoRequest {
  idea: string; // Ideea de clip (ex: "Apartament 3 camere în centrul Clujului, preț excelent")
  platform?: 'tiktok' | 'reels' | 'shorts';
  avatarName?: string;
  productId?: string; // ID produs asociat (opțional)
  userId?: string; // Utilizatorul autentificat din admin
}

export interface IdeaVideoResponse {
  success: boolean;
  video?: {
    url: string;
    path: string;
    publicUrl: string;
    duration?: number;
    id?: string; // ID-ul din Supabase
  };
  script?: {
    narration: string;
    hashtags: string[];
    callToAction: string;
  };
  ideaId?: string;
  error?: string;
}

/**
 * Convertește o idee simplă într-un obiect ProductData pentru generarea scriptului
 */
function ideaToProductData(idea: string): any {
  // Extract basic information from idea using simple parsing
  // This is a basic implementation - could be enhanced with GPT extraction
  
  const lowerIdea = idea.toLowerCase();
  
  // Try to extract price
  const priceMatch = idea.match(/(\d+[\s.,]?\d*)\s*(?:ron|euro|eur|€|\$)/i);
  const price = priceMatch ? parseFloat(priceMatch[1].replace(/[\s.,]/g, '')) : undefined;
  
  // Try to extract location
  const locationMatch = idea.match(/(?:în|la|pe)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i);
  const location = locationMatch ? locationMatch[1] : undefined;
  
  // Try to extract category keywords
  let category = 'Imobiliare';
  if (lowerIdea.includes('apartament') || lowerIdea.includes('camera')) {
    category = 'Imobiliare';
  } else if (lowerIdea.includes('mașină') || lowerIdea.includes('auto') || lowerIdea.includes('vehicul')) {
    category = 'Autovehicule';
  } else if (lowerIdea.includes('teren') || lowerIdea.includes('pământ')) {
    category = 'Imobiliare';
  }
  
  return {
    id: `idea-${Date.now()}`,
    title: idea,
    description: idea,
    price,
    category,
    location,
    features: [],
    images: [],
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: IdeaVideoRequest = await request.json();
    
    // Validare
    if (!body.idea || body.idea.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Ideea de clip este obligatorie' },
        { status: 400 }
      );
    }

    const {
      idea,
      platform = 'tiktok',
      avatarName = 'Ana',
      productId,
      userId,
    } = body;

    console.log('🎬 Starting video generation from idea:', idea);

    // Step 1: Convert idea to ProductData
    const productData = ideaToProductData(idea);

    // Step 2: Generate script in Romanian
    console.log('📝 Generating Romanian script...');
    const script = await generateAvatarScript(productData, platform, avatarName);
    console.log('✅ Script generated:', script.narration.substring(0, 50) + '...');

    // Step 3: Generate Romanian voice with ElevenLabs
    console.log('🎙️ Generating Romanian voice...');
    const audioBuffer = await generateVoiceAudio(script.narration, {
      voiceId: process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL',
    });
    const audioFilename = `idea_audio_${Date.now()}.mp3`;
    const audioPath = await saveVoiceAudio(audioBuffer, audioFilename);
    console.log('✅ Romanian voice generated:', audioPath);

    // Step 4: Generate avatar video with HeyGen
    console.log('🎬 Generating avatar video with HeyGen...');
    
    if (!process.env.HEYGEN_API_KEY) {
      throw new Error('HEYGEN_API_KEY is not configured');
    }

    // Create public URL for audio (needed by HeyGen)
    const audioUrl = process.env.NEXT_PUBLIC_SITE_URL
      ? `${process.env.NEXT_PUBLIC_SITE_URL}/videos/audio/${audioFilename}`
      : undefined;

    const heygenVideo = await generateHeyGenVideo(
      script.narration,
      audioUrl,
      {
        avatarId: process.env.HEYGEN_AVATAR_ID || process.env.AVATAR_ID || 'female_friendly_1',
        aspectRatio: '9:16', // Vertical pentru TikTok/Reels/Shorts
      }
    );

    if (!heygenVideo.videoUrl) {
      throw new Error('HeyGen video URL not available');
    }

    console.log('✅ Avatar video generated:', heygenVideo.videoUrl);

    // Step 5: Download avatar video
    const videosDir = join(process.cwd(), 'public', 'videos', 'ideas');
    await mkdir(videosDir, { recursive: true });

    const avatarFilename = `idea_avatar_${Date.now()}.mp4`;
    const avatarVideoPath = join(videosDir, avatarFilename);

    await downloadHeyGenVideo(heygenVideo.videoUrl, avatarVideoPath);
    console.log('✅ Avatar video downloaded:', avatarVideoPath);

    // Step 6: Merge with logo, Romanian subtitles, and effects
    console.log('🎞️ Merging video with Romanian subtitles and logo...');
    
    const finalFilename = `idea_final_${Date.now()}.mp4`;
    const finalVideoPath = join(videosDir, finalFilename);

    // Prepare subtitles from script
    const subtitles = script.subtitles || [];
    
    // If no subtitles provided, create simple ones from narration
    if (subtitles.length === 0) {
      const words = script.narration.split(' ');
      const wordsPerSubtitle = 5;
      const timePerWord = 0.5;
      
      for (let i = 0; i < words.length; i += wordsPerSubtitle) {
        const subtitleText = words.slice(i, i + wordsPerSubtitle).join(' ');
        const startTime = i * timePerWord;
        const endTime = (i + wordsPerSubtitle) * timePerWord;
        subtitles.push({
          text: subtitleText,
          startTime,
          endTime,
        });
      }
    }

    const logoPath = join(process.cwd(), 'public', 'logo.png');
    const logoExists = (await import('fs')).existsSync(logoPath);

    await mergeAvatarVideo({
      avatarVideoPath: avatarVideoPath,
      logoPath: logoExists ? logoPath : undefined,
      subtitles: subtitles,
      outputPath: finalVideoPath,
      backgroundColor: '#000000',
      addIntro: false,
      addOutro: true,
      outroText: 'Vizitează Gobid.ro pentru mai multe anunțuri!',
    });

    console.log('✅ Final video merged:', finalVideoPath);

    // Step 7: Calculate video duration (approximate from audio length)
    // This is a simple estimation - in production, use FFprobe
    const estimatedDuration = Math.ceil(script.narration.split(' ').length * 0.5); // ~0.5 sec per word

    // Step 8: Save to Supabase
    console.log('💾 Saving video to Supabase...');
    
    const publicVideoUrl = `/videos/ideas/${finalFilename}`;
    
    // Use provided productId or generate a temporary one
    const videoProductId = productId || `idea-${Date.now()}`;

    const savedVideo = await saveVideo({
      produs_id: videoProductId,
      url: publicVideoUrl,
      durata: estimatedDuration,
      platforme: [platform],
      titlu: idea.substring(0, 100), // Truncate if too long
      descriere: script.narration.substring(0, 500), // Truncate if too long
    });

    console.log('✅ Video saved to Supabase:', savedVideo.id);

    let savedIdeaId: string | undefined;

    if (userId) {
      const ideaPayload = {
        user_id: userId,
        idea,
        platform,
        avatar_name: avatarName,
        product_id: productId ?? null,
        script: {
          narration: script.narration,
          hashtags: script.hashtags || [],
          callToAction: script.callToAction || '',
        },
        video: {
          id: savedVideo.id,
          url: publicVideoUrl,
          publicUrl: process.env.NEXT_PUBLIC_SITE_URL
            ? `${process.env.NEXT_PUBLIC_SITE_URL}${publicVideoUrl}`
            : publicVideoUrl,
          duration: estimatedDuration,
        },
        status: 'success',
      };

      try {
        const client = supabaseAdmin ?? supabase;
        const { data: ideaData, error: ideaError } = await client
          .from('ai_video_ideas')
          .insert(ideaPayload)
          .select('id')
          .single();

        if (ideaError) {
          console.error('❌ Failed to save video idea record:', ideaError);
        } else {
          savedIdeaId = ideaData?.id;
          console.log('✅ Video idea saved to Supabase:', savedIdeaId);
        }
      } catch (insertError) {
        console.error('❌ Unexpected error saving video idea:', insertError);
      }
    } else {
      console.warn('ℹ️ Video idea generated without userId; skipping ai_video_ideas insert.');
    }

    // Step 9: Return response
    const response: IdeaVideoResponse = {
      success: true,
      video: {
        url: publicVideoUrl,
        path: finalVideoPath,
        publicUrl: process.env.NEXT_PUBLIC_SITE_URL
          ? `${process.env.NEXT_PUBLIC_SITE_URL}${publicVideoUrl}`
          : publicVideoUrl,
        duration: estimatedDuration,
        id: savedVideo.id,
      },
      script: {
        narration: script.narration,
        hashtags: script.hashtags || [],
        callToAction: script.callToAction || '',
      },
      ideaId: savedIdeaId,
    };

    return NextResponse.json(response, { status: 200 });

  } catch (error: any) {
    console.error('❌ Error generating video from idea:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to generate video from idea',
      },
      { status: 500 }
    );
  }
}

