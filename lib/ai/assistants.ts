/**
 * Gestionare Asistenți AI
 * Permite configurarea mai multor asistenți cu intervale de activitate
 */

export interface AIAssistant {
  id: string;
  name: string;
  avatar: string;
  description?: string;
  enabled: boolean;
  activeHours: {
    start: string; // Format: "HH:mm" (ex: "09:00")
    end: string;   // Format: "HH:mm" (ex: "17:00")
  }[];
  systemPrompt?: string;
  style?: 'formal' | 'casual' | 'friendly' | 'professional';
}

export const DEFAULT_ASSISTANTS: AIAssistant[] = [
  {
    id: 'cristina-default',
    name: 'Cristina',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&h=150&fit=crop&crop=face&auto=format',
    description: 'Asistenta ta virtuală',
    enabled: true,
    activeHours: [
      { start: '00:00', end: '23:59' }, // Activă 24/7
    ],
    style: 'friendly',
  },
];

/**
 * Încarcă asistenții AI din localStorage
 */
export function loadAssistants(): AIAssistant[] {
  if (typeof window === 'undefined') {
    return DEFAULT_ASSISTANTS;
  }

  try {
    const saved = localStorage.getItem('aiAssistants');
    if (saved) {
      const parsed = JSON.parse(saved);
      // Asigură-te că avem cel puțin un asistent
      if (parsed && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Error loading assistants:', e);
  }

  return DEFAULT_ASSISTANTS;
}

/**
 * Salvează asistenții AI în localStorage
 */
export function saveAssistants(assistants: AIAssistant[]): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem('aiAssistants', JSON.stringify(assistants));
  } catch (e) {
    console.error('Error saving assistants:', e);
  }
}

/**
 * Obține asistentul activ pentru ora curentă
 */
export function getActiveAssistant(): AIAssistant | null {
  const assistants = loadAssistants();
  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  // Filtrează doar asistenții activați
  const enabledAssistants = assistants.filter(a => a.enabled);

  if (enabledAssistants.length === 0) {
    return null;
  }

  // Găsește primul asistent care este activ în intervalul curent
  for (const assistant of enabledAssistants) {
    for (const interval of assistant.activeHours) {
      if (isTimeInInterval(currentTime, interval.start, interval.end)) {
        return assistant;
      }
    }
  }

  // Dacă niciun asistent nu este activ, returnează primul enabled (fallback)
  return enabledAssistants[0] || null;
}

/**
 * Verifică dacă ora curentă este în intervalul specificat
 */
function isTimeInInterval(currentTime: string, startTime: string, endTime: string): boolean {
  const current = timeToMinutes(currentTime);
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);

  // Dacă intervalul trece peste miezul nopții (ex: 22:00 - 06:00)
  if (end < start) {
    return current >= start || current <= end;
  }

  // Interval normal (ex: 09:00 - 17:00)
  return current >= start && current <= end;
}

/**
 * Convertește ora (HH:mm) în minute din zi
 */
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Verifică dacă există asistenți activi în intervalul curent
 */
export function hasActiveAssistant(): boolean {
  return getActiveAssistant() !== null;
}

/**
 * Obține toți asistenții activați
 */
export function getEnabledAssistants(): AIAssistant[] {
  return loadAssistants().filter(a => a.enabled);
}

















