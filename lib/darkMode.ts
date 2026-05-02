/**
 * Global dark mode utility functions
 * Ensures dark mode is applied correctly to the HTML element
 */

export function applyDarkModeToHTML(darkMode: boolean): void {
  if (typeof window === 'undefined') return;
  
  const htmlElement = document.documentElement;
  
  // CRITICAL: Remove dark class first, then add if needed
  // This ensures clean state
  htmlElement.classList.remove('dark');
  
  // Apply dark mode if needed
  if (darkMode) {
    htmlElement.classList.add('dark');
  }
  
  // Force immediate reflow to ensure styles are applied
  void htmlElement.offsetHeight;
  
  // Verify it was applied correctly
  const hasDark = htmlElement.classList.contains('dark');
  if (hasDark !== darkMode) {
    // If toggle didn't work, force it
    if (darkMode) {
      htmlElement.classList.add('dark');
    } else {
      htmlElement.classList.remove('dark');
    }
    void htmlElement.offsetHeight;
  }
}

export function getDarkModeFromStorage(): boolean {
  if (typeof window === 'undefined') return false;
  const saved = localStorage.getItem('darkMode');
  // Default to white mode (false) if not set or invalid
  if (saved === null || saved === undefined) {
    // Ensure white mode is set as default
    localStorage.setItem('darkMode', 'false');
    return false;
  }
  // Only return true if explicitly set to 'true'
  return saved === 'true';
}

export function saveDarkModeToStorage(darkMode: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('darkMode', String(darkMode));
}

export function toggleDarkModeGlobal(): boolean {
  if (typeof window === 'undefined') return false;
  
  const currentMode = getDarkModeFromStorage();
  const newMode = !currentMode;
  
  // Save to storage
  saveDarkModeToStorage(newMode);
  
  // Apply to HTML immediately
  applyDarkModeToHTML(newMode);
  
  // Dispatch events for synchronization
  window.dispatchEvent(new Event('darkModeChanged'));
  window.dispatchEvent(new CustomEvent('darkModeToggled', { detail: { darkMode: newMode } }));
  
  return newMode;
}

