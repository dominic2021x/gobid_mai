/**
 * Video Merge - FFmpeg pentru compunerea finală a video-ului
 * Combină clipul avatarului cu logo, subtitrări și efecte
 */

import ffmpeg from 'fluent-ffmpeg';
import { join } from 'path';
import { writeFile, mkdir, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import sharp from 'sharp';

// Note: ffmpeg-static is loaded dynamically in getFfmpegPath() to avoid Next.js bundling issues

// Function to get FFmpeg path (called at module load and at runtime)
function getFfmpegPath(): string | null {
  try {
    // Try to get ffmpeg-static path
    let ffmpegStaticPath: string | null = null;
    
    try {
      const ffmpegStatic = require('ffmpeg-static');
      if (ffmpegStatic && typeof ffmpegStatic === 'string') {
        ffmpegStaticPath = ffmpegStatic;
      }
    } catch (e) {
      console.warn('⚠️  Could not load ffmpeg-static:', e);
    }

    if (ffmpegStaticPath) {
      // Resolve to absolute path to avoid path issues
      const { resolve } = require('path');
      const absolutePath = resolve(ffmpegStaticPath);
      
      // Use the path from ffmpeg-static if it exists
      if (existsSync(absolutePath)) {
        return absolutePath;
      } else if (existsSync(ffmpegStaticPath)) {
        return ffmpegStaticPath;
      }
    }

    // Try to find FFmpeg in system PATH
    try {
      const { execSync } = require('child_process');
      const systemFfmpeg = execSync('which ffmpeg', { encoding: 'utf-8' }).trim();
      if (systemFfmpeg && existsSync(systemFfmpeg)) {
        return systemFfmpeg;
      }
    } catch (e) {
      // System FFmpeg not found, that's okay
    }
  } catch (error) {
    console.error('❌ Error getting FFmpeg path:', error);
  }

  return null;
}

// Set FFmpeg path at module load
let ffmpegPath: string | null = getFfmpegPath();

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
  console.log('✅ FFmpeg path initialized:', ffmpegPath);
} else {
  console.warn('⚠️  FFmpeg path not found at module load. Will try again at runtime.');
}

export interface VideoMergeOptions {
  avatarVideoPath: string; // Path to avatar video from HeyGen/Synthesia
  logoPath?: string; // Path to logo image
  subtitles: Array<{
    text: string;
    startTime: number;
    endTime: number;
  }>;
  outputPath: string;
  backgroundColor?: string;
  addIntro?: boolean;
  addOutro?: boolean;
  outroText?: string;
}

/**
 * Creează fișier SRT pentru subtitrări
 */
async function createSubtitleFile(
  subtitles: Array<{ text: string; startTime: number; endTime: number }>,
  outputPath: string
): Promise<string> {
  const srtContent = subtitles
    .map((sub, index) => {
      const start = formatSRTTime(sub.startTime);
      const end = formatSRTTime(sub.endTime);
      return `${index + 1}\n${start} --> ${end}\n${sub.text}\n`;
    })
    .join('\n');

  await writeFile(outputPath, srtContent, 'utf-8');
  return outputPath;
}

/**
 * Formatează timpul pentru SRT (HH:MM:SS,mmm)
 */
function formatSRTTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const milliseconds = Math.floor((seconds % 1) * 1000);

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${milliseconds.toString().padStart(3, '0')}`;
}

/**
 * Pregătește logo pentru overlay (resize, transparency)
 */
async function prepareLogo(logoPath: string, outputDir: string): Promise<string> {
  const outputPath = join(outputDir, 'logo_prepared.png');

  try {
    await sharp(logoPath)
      .resize(200, null, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .png({ quality: 100 })
      .toFile(outputPath);

    return outputPath;
  } catch (error) {
    console.error('Error preparing logo:', error);
    return logoPath; // Return original if resize fails
  }
}

/**
 * Creează clip intro/outro text
 */
async function createTextClip(
  text: string,
  duration: number,
  outputPath: string,
  backgroundColor: string = '#000000'
): Promise<string> {
  return new Promise((resolve, reject) => {
    // Get FFmpeg path (may need to reload at runtime)
    let clipFfmpegPath = ffmpegPath || getFfmpegPath();
    
    if (!clipFfmpegPath || !existsSync(clipFfmpegPath)) {
      reject(new Error('FFmpeg path not configured'));
      return;
    }
    
    // Ensure FFmpeg path is set
    ffmpeg.setFfmpegPath(clipFfmpegPath);

    // Try to find a system font (works on macOS, Linux, Windows)
    let fontPath = '/System/Library/Fonts/Helvetica.ttc'; // macOS default
    if (!existsSync(fontPath)) {
      // Try other common font paths
      const alternativeFonts = [
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', // Linux
        'C:/Windows/Fonts/arial.ttf', // Windows
      ];
      for (const font of alternativeFonts) {
        if (existsSync(font)) {
          fontPath = font;
          break;
        }
      }
    }

    const command = ffmpeg()
      .input('color=c=black:s=1080x1920:d=' + duration)
      .inputOptions(['-f', 'lavfi']);

    // Only add fontfile if it exists, otherwise use default font
    const drawtextOptions: any = {
      text: text.replace(/'/g, "\\'"), // Escape single quotes
      fontsize: 48,
      fontcolor: 'white',
      x: '(w-text_w)/2',
      y: '(h-text_h)/2',
      box: 1,
      boxcolor: 'black@0.5',
      boxborderw: 10,
    };

    if (existsSync(fontPath)) {
      drawtextOptions.fontfile = fontPath;
    }

    command
      .complexFilter([
        {
          filter: 'drawtext',
          options: drawtextOptions,
        },
      ])
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', (err) => {
        console.error('Text clip creation error:', err);
        reject(err);
      })
      .run();
  });
}

/**
 * Combină video-ul avatarului cu logo, subtitrări și efecte
 */
export async function mergeAvatarVideo(options: VideoMergeOptions): Promise<string> {
  const {
    avatarVideoPath,
    logoPath,
    subtitles,
    outputPath,
    backgroundColor = '#000000',
    addIntro = false,
    addOutro = false,
    outroText = 'Descoperă mai multe pe gobid.ro',
  } = options;

  // Ensure output directory exists
  const outputDir = join(outputPath, '..');
  if (!existsSync(outputDir)) {
    await mkdir(outputDir, { recursive: true });
  }

  // Create temporary directory
  const tempDir = join(process.cwd(), 'tmp', 'video_merge', Date.now().toString());
  await mkdir(tempDir, { recursive: true });

  try {
    const filters: string[] = [];
    let inputIndex = 0;

    // Prepare logo if provided
    let preparedLogoPath: string | null = null;
    if (logoPath && existsSync(logoPath)) {
      preparedLogoPath = await prepareLogo(logoPath, tempDir);
      filters.push(
        `[${inputIndex}:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2[scaled]`
      );
      filters.push(
        `[scaled][${inputIndex + 1}:v]overlay=W-w-20:20:enable='between(t,0,30)'[withlogo]`
      );
      inputIndex += 2;
    } else {
      filters.push(
        `[${inputIndex}:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2[withlogo]`
      );
      inputIndex += 1;
    }

    // Create subtitle file
    const subtitlePath = join(tempDir, 'subtitles.srt');
    await createSubtitleFile(subtitles, subtitlePath);

    // Add subtitles
    filters.push(
      `[withlogo]subtitles=${subtitlePath}:force_style='FontName=Poppins,FontSize=32,PrimaryColour=&Hffffff,OutlineColour=&H000000,Outline=3,Shadow=2,MarginV=60,Alignment=2'[withsubtitles]`
    );

    // Build FFmpeg command
    return new Promise(async (resolve, reject) => {
      // Re-check FFmpeg path at runtime (Next.js may bundle differently)
      let runtimeFfmpegPath = ffmpegPath;
      
      // If FFmpeg path is not set or doesn't exist, try to reload it
      if (!runtimeFfmpegPath || !existsSync(runtimeFfmpegPath)) {
        console.log('🔄 Re-checking FFmpeg path at runtime...');
        runtimeFfmpegPath = getFfmpegPath();
        
        if (runtimeFfmpegPath) {
          ffmpeg.setFfmpegPath(runtimeFfmpegPath);
          console.log('✅ FFmpeg path set at runtime:', runtimeFfmpegPath);
          // Update module-level variable
          ffmpegPath = runtimeFfmpegPath;
        } else {
          console.warn('⚠️  Could not find FFmpeg path at runtime');
        }
      }

      if (!runtimeFfmpegPath) {
        reject(new Error('FFmpeg path not configured. Please install ffmpeg-static or system FFmpeg.'));
        return;
      }

      // Verify FFmpeg path before proceeding
      if (!existsSync(runtimeFfmpegPath)) {
        reject(new Error(`FFmpeg not found at path: ${runtimeFfmpegPath}. Please reinstall ffmpeg-static.`));
        return;
      }

      console.log('🎬 Using FFmpeg at:', runtimeFfmpegPath);

      let command = ffmpeg();

      // Add avatar video (verify it exists)
      if (!existsSync(avatarVideoPath)) {
        reject(new Error(`Avatar video not found: ${avatarVideoPath}`));
        return;
      }
      command = command.input(avatarVideoPath);

      // Add logo if provided
      if (preparedLogoPath && existsSync(preparedLogoPath)) {
        command = command.input(preparedLogoPath);
      }

      // Add intro if requested (skip if creation fails)
      if (addIntro) {
        const introPath = join(tempDir, 'intro.mp4');
        try {
          await createTextClip('Gobid.ro', 2, introPath, backgroundColor);
          if (existsSync(introPath)) {
            command = command.input(introPath);
          }
        } catch (err) {
          console.warn('⚠️  Intro creation failed, skipping intro:', err);
        }
      }

      // Add outro if requested (skip if creation fails)
      if (addOutro) {
        const outroPath = join(tempDir, 'outro.mp4');
        try {
          await createTextClip(outroText, 3, outroPath, backgroundColor);
          if (existsSync(outroPath)) {
            command = command.input(outroPath);
          }
        } catch (err) {
          console.warn('⚠️  Outro creation failed, skipping outro:', err);
        }
      }

      // Build complex filter based on available inputs
      const complexFilters: any[] = [];
      
      // Scale avatar video
      complexFilters.push({
        filter: 'scale',
        inputs: '0:v',
        options: {
          w: 1080,
          h: 1920,
          force_original_aspect_ratio: 'decrease',
        },
        outputs: 'scaled',
      });

      // Add logo overlay if available
      let currentOutput = 'scaled';
      if (preparedLogoPath && existsSync(preparedLogoPath)) {
        complexFilters.push({
          filter: 'overlay',
          inputs: ['scaled', '1:v'],
          options: {
            x: 'W-w-20',
            y: '20',
          },
          outputs: 'withlogo',
        });
        currentOutput = 'withlogo';
      } else {
        // No logo, just pass through
        complexFilters.push({
          filter: 'null',
          inputs: 'scaled',
          outputs: 'withlogo',
        });
        currentOutput = 'withlogo';
      }

      // Add subtitles (Romanian - white text, yellow highlight)
      // Escape subtitle path for FFmpeg (handle special characters)
      const subtitlePathEscaped = subtitlePath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
      complexFilters.push({
        filter: 'subtitles',
        inputs: currentOutput,
        options: {
          filename: subtitlePathEscaped,
          force_style:
            'FontName=Poppins,FontSize=32,PrimaryColour=&Hffffff,OutlineColour=&Hffff00,Outline=3,Shadow=2,MarginV=60,Alignment=2,BorderStyle=1,BackColour=&Hffff00',
        },
        outputs: 'final',
      });

      // Build output options
      const outputOptions = [
        '-map [final]',
        '-map 0:a?', // Audio from avatar video
        '-c:v libx264',
        '-preset medium',
        '-crf 23',
        '-c:a aac',
        '-b:a 192k',
        '-pix_fmt yuv420p',
        '-r 30',
        '-shortest',
        '-y', // Overwrite output file
      ];

      console.log('🎬 Starting FFmpeg merge...');
      console.log('📁 Avatar video:', avatarVideoPath);
      console.log('📁 Output path:', outputPath);
      console.log('📁 Subtitle path:', subtitlePath);
      console.log('📁 FFmpeg path:', ffmpegPath);

      // Execute FFmpeg command
      command
        .complexFilter(complexFilters)
        .outputOptions(outputOptions)
        .output(outputPath)
        .on('start', (commandLine) => {
          console.log('📤 FFmpeg merge command:', commandLine);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            console.log(`⏳ Merging: ${Math.round(progress.percent)}% done`);
          }
        })
        .on('end', () => {
          console.log('✅ Video merge completed:', outputPath);
          resolve(outputPath);
        })
        .on('error', (err) => {
          console.error('❌ FFmpeg merge error:', err);
          console.error('Error details:', {
            message: err.message,
            code: (err as any).code,
            signal: (err as any).signal,
            killed: (err as any).killed,
            stdout: (err as any).stdout,
            stderr: (err as any).stderr,
          });
          reject(new Error(`FFmpeg merge error: ${err.message}`));
        })
        .run();
    });
  } catch (error: any) {
    console.error('Error merging video:', error);
    throw new Error(`Failed to merge video: ${error.message}`);
  }
}

