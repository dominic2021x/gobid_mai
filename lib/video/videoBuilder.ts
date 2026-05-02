/**
 * Video Builder - FFmpeg pentru compunerea clipurilor video
 * Creează video-uri verticale (1080x1920) cu imagini, audio și subtitrări
 */

import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { join } from 'path';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import sharp from 'sharp';

// Set FFmpeg path - ensure it's properly configured
let ffmpegPath: string | null = null;

try {
  if (ffmpegStatic && typeof ffmpegStatic === 'string') {
    // Resolve to absolute path to avoid path issues
    const { resolve } = require('path');
    const absolutePath = resolve(ffmpegStatic);
    
    // Use the path from ffmpeg-static if it exists
    if (existsSync(absolutePath)) {
      ffmpegPath = absolutePath;
      if (ffmpegPath) {
        ffmpeg.setFfmpegPath(ffmpegPath);
        console.log('✅ FFmpeg path set:', ffmpegPath);
      }
    } else if (existsSync(ffmpegStatic)) {
      // Try original path
      ffmpegPath = ffmpegStatic;
      if (ffmpegPath) {
        ffmpeg.setFfmpegPath(ffmpegPath);
        console.log('✅ FFmpeg path set (original):', ffmpegPath);
      }
    } else {
      console.warn('⚠️  FFmpeg path from ffmpeg-static does not exist:', ffmpegStatic);
      console.warn('⚠️  Absolute path also does not exist:', absolutePath);
      // Try to find FFmpeg in system PATH
      try {
        const { execSync } = require('child_process');
        const systemFfmpeg = execSync('which ffmpeg', { encoding: 'utf-8' }).trim();
        if (systemFfmpeg) {
          ffmpegPath = systemFfmpeg;
          if (ffmpegPath) {
            ffmpeg.setFfmpegPath(ffmpegPath);
            console.log('✅ Using system FFmpeg:', ffmpegPath);
          }
        }
      } catch (e) {
        console.error('❌ FFmpeg not found in system PATH either');
      }
    }
  } else {
    console.warn('⚠️  ffmpeg-static returned invalid path:', ffmpegStatic);
  }
} catch (error) {
  console.error('❌ Error setting FFmpeg path:', error);
}

if (!ffmpegPath) {
  console.error('❌ FFmpeg path not configured. Video building will fail.');
  console.error('💡 Try running: npm install ffmpeg-static --save');
}

export interface VideoBuildOptions {
  images: string[]; // Paths to product images
  audioPath: string; // Path to audio file
  subtitles: Array<{
    text: string;
    startTime: number;
    endTime: number;
  }>;
  outputPath: string;
  duration?: number; // Total video duration in seconds
  backgroundColor?: string;
}

/**
 * Pregătește imagini pentru video (resize, crop, format vertical)
 */
async function prepareImages(
  imagePaths: string[],
  outputDir: string
): Promise<string[]> {
  const preparedImages: string[] = [];

  for (let i = 0; i < imagePaths.length; i++) {
    const imagePath = imagePaths[i];
    const outputPath = join(outputDir, `prepared_${i}.jpg`);

    try {
      // Read image
      let image = sharp(imagePath);

      // Get metadata
      const metadata = await image.metadata();
      const width = metadata.width || 1920;
      const height = metadata.height || 1080;

      // Calculate dimensions for vertical video (1080x1920)
      const targetWidth = 1080;
      const targetHeight = 1920;

      // Resize and crop to fit vertical format
      const resized = image
        .resize(targetWidth, targetHeight, {
          fit: 'cover',
          position: 'center',
        })
        .jpeg({ quality: 90 });

      await resized.toFile(outputPath);
      preparedImages.push(outputPath);
    } catch (error) {
      console.error(`Error preparing image ${imagePath}:`, error);
      // Use original if resize fails
      preparedImages.push(imagePath);
    }
  }

  return preparedImages;
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
 * Construiește video-ul final folosind FFmpeg
 */
export async function buildVideo(options: VideoBuildOptions): Promise<string> {
  const {
    images,
    audioPath,
    subtitles,
    outputPath,
    duration,
    backgroundColor = '#000000',
  } = options;

  // Ensure output directory exists
  const outputDir = join(outputPath, '..');
  if (!existsSync(outputDir)) {
    await mkdir(outputDir, { recursive: true });
  }

  // Prepare temporary directory for processed images
  const tempDir = join(process.cwd(), 'tmp', 'video_build', Date.now().toString());
  await mkdir(tempDir, { recursive: true });

  try {
    // Prepare images
    const preparedImages = await prepareImages(images, tempDir);

    if (preparedImages.length === 0) {
      throw new Error('No valid images provided');
    }

    // Calculate image display duration
    const audioDuration = duration || 30; // Default 30 seconds
    const imageDuration = audioDuration / preparedImages.length;

    // Create image sequence with zoom effect
    const imageSequence: string[] = [];
    for (let i = 0; i < preparedImages.length; i++) {
      imageSequence.push(preparedImages[i]);
    }

    // Create subtitle file
    const subtitlePath = join(tempDir, 'subtitles.srt');
    await createSubtitleFile(subtitles, subtitlePath);

    // Build video with FFmpeg
    return new Promise((resolve, reject) => {
      let command = ffmpeg();

      // Add images as input
      preparedImages.forEach((img, index) => {
        command = command.input(img);
      });

      // Add audio
      command = command.input(audioPath);

      // Complex filter for slideshow with zoom and subtitles
      const filters: string[] = [];

      // Image slideshow with zoom
      const imageInputs = preparedImages.map((_, i) => `[${i}:v]`);
      filters.push(
        `${imageInputs.join('')}concat=n=${preparedImages.length}:v=1:a=0[concat]`
      );

      // Zoom effect on concat
      filters.push(
        `[concat]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,zoompan=z='min(zoom+0.0015,1.5)':d=${Math.floor(
          imageDuration * 30
        )}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920[zoomed]`
      );

      // Add subtitles
      filters.push(
        `[zoomed]subtitles=${subtitlePath}:force_style='FontName=Poppins,FontSize=24,PrimaryColour=&Hffffff,OutlineColour=&H000000,Outline=2,Shadow=1,MarginV=40'[final]`
      );

      command
        .complexFilter(filters)
        .outputOptions([
          '-map [final]',
          '-map', `${preparedImages.length}:a`,
          '-c:v libx264',
          '-preset medium',
          '-crf 23',
          '-c:a aac',
          '-b:a 192k',
          '-shortest',
          '-pix_fmt yuv420p',
          '-r 30',
        ])
        .output(outputPath)
        .on('start', (commandLine) => {
          console.log('FFmpeg command:', commandLine);
        })
        .on('progress', (progress) => {
          console.log(`Processing: ${progress.percent}% done`);
        })
        .on('end', () => {
          console.log('Video build completed:', outputPath);
          resolve(outputPath);
        })
        .on('error', (err) => {
          console.error('FFmpeg error:', err);
          reject(new Error(`FFmpeg error: ${err.message}`));
        })
        .run();
    });
  } catch (error: any) {
    console.error('Error building video:', error);
    throw new Error(`Failed to build video: ${error.message}`);
  }
}

