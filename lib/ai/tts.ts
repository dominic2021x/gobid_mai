/**
 * Text-to-Speech Service cu voce feminină realistă
 * Folosește Edge TTS (Microsoft) pentru voci naturale românești
 * Fallback la Web Speech API dacă Edge TTS nu e disponibil
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface TTSOptions {
  voice?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  addNaturalPauses?: boolean;
}

/**
 * Voce feminină română (Edge TTS)
 */
const ROMANIAN_FEMALE_VOICES = [
  'ro-RO-AlinaNeural', // Voce feminină naturală, caldă
  'ro-RO-AndreiNeural', // Voce masculină (backup)
];

/**
 * Adaugă pauze naturale și ezitări în text
 * Folosește configurația personalizată dacă e disponibilă
 */
function addNaturalSpeechPatterns(text: string, config?: {
  pausesProbability?: number;
  hesitationsProbability?: number;
  connectorsEnabled?: boolean;
}): string {
  let natural = text;
  
  const pausesProb = config?.pausesProbability ?? 0.3;
  const hesitationsProb = config?.hesitationsProbability ?? 0.2;
  const connectorsEnabled = config?.connectorsEnabled !== false;
  
  // Adaugă mică ezitare după puncte de întrebare (înainte de răspuns)
  if (Math.random() < hesitationsProb) {
    natural = natural.replace(/(\?)\s+([A-ZĂÂÎȘȚ])/g, '$1... um, $2');
  }
  
  // Adaugă pauze după virgule (la nevoie)
  const commaPattern = /([a-zăâîșț])(,)\s+([A-ZĂÂÎȘȚ])/g;
  if (Math.random() < pausesProb) {
    natural = natural.replace(commaPattern, '$1$2... $3');
  }
  
  // Adaugă "așa" sau "deci" după puncte (dacă e activat)
  if (connectorsEnabled) {
    const periodPattern = /(\.)\s+([A-ZĂÂÎȘȚ])/g;
    if (Math.random() < hesitationsProb) {
      natural = natural.replace(periodPattern, '$1 Așa... $2');
    }
  }
  
  // Adaugă "um" înainte de enumerări
  if (Math.random() < hesitationsProb) {
    natural = natural.replace(/(:\s+)([0-9]+|[A-ZĂÂÎȘȚ])/g, '$1um... $2');
  }
  
  return natural;
}

/**
 * Generează TTS folosind Edge TTS și returnează audio ca Buffer
 */
export async function generateTTSAudio(
  text: string,
  options: TTSOptions = {}
): Promise<Buffer> {
  const {
    voice = ROMANIAN_FEMALE_VOICES[0],
    rate = '+0%',
    pitch = '+0Hz',
    volume = '+0%',
    addNaturalPauses = true,
  } = options;

  // Încarcă configurația personalizată pentru pattern-uri
  let voiceConfig: any = null;
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem('aiResponseConfig');
      if (saved) {
        const config = JSON.parse(saved);
        if (config.voicePatterns && config.voicePatterns.enabled) {
          voiceConfig = config.voicePatterns;
        }
      }
    } catch (e) {
      // Ignore errors
    }
  }

  // Adaugă pattern-uri naturale de vorbire
  const naturalText = addNaturalPauses ? addNaturalSpeechPatterns(text, voiceConfig) : text;

  // Creează fișier temporar pentru output
  const tempFile = `/tmp/tts-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.mp3`;
  
  try {
    // Escape text pentru shell (handle special chars)
    const escapedText = naturalText
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/"/g, '\\"')
      .replace(/\$/g, '\\$')
      .replace(/`/g, '\\`');

    // Generează audio folosind edge-tts
    const command = `edge-tts --voice ${voice} --text "${escapedText}" --rate ${rate} --pitch ${pitch} --volume ${volume} --write-media "${tempFile}"`;
    
    await execAsync(command, {
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    // Citește fișierul generat
    const fs = await import('fs');
    const audioBuffer = fs.readFileSync(tempFile);
    
    // Șterge fișierul temporar
    fs.unlinkSync(tempFile);
    
    return audioBuffer;
  } catch (error: any) {
    // Cleanup în caz de eroare
    try {
      const fs = await import('fs');
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    } catch {}
    
    console.error('Edge TTS error:', error);
    throw new Error(`Failed to generate TTS: ${error.message}`);
  }
}

/**
 * Listează voci disponibile pentru română
 */
export async function listRomanianVoices(): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const process = spawn('edge-tts', ['--list-voices']);
    let output = '';
    
    process.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    process.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`edge-tts exited with code ${code}`));
        return;
      }
      
      // Parse voices list
      const lines = output.split('\n');
      const romanianVoices = lines
        .filter(line => line.includes('ro-RO'))
        .map(line => {
          const match = line.match(/Name:\s+(.+)/);
          return match ? match[1].trim() : null;
        })
        .filter(Boolean) as string[];
      
      resolve(romanianVoices);
    });
    
    process.on('error', reject);
  });
}

/**
 * Verifică dacă edge-tts este instalat
 */
export async function checkTTSAvailable(): Promise<boolean> {
  try {
    await execAsync('edge-tts --version');
    return true;
  } catch {
    return false;
  }
}

