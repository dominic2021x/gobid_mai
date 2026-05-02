# Instalare Poppler pentru Extragere PDF

Poppler este necesar pentru extragerea textului din PDF-uri scanate folosind OCR.

## Instalare automată (recomandat)

Rulează scriptul de instalare:

```bash
./scripts/install-poppler.sh
```

Acest script va:
1. Verifica dacă Homebrew este instalat
2. Instala Homebrew dacă este necesar (va cere parola de administrator)
3. Instala Poppler
4. Verifica instalarea

## Instalare manuală

### Pasul 1: Instalează Homebrew (dacă nu este instalat)

Deschide Terminalul și rulează:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Această comandă va:
- Cere parola de administrator
- Descărca și instala Homebrew
- Poate dura câteva minute

**Pentru Apple Silicon Macs (M1/M2/M3):**
După instalare, adaugă Homebrew la PATH:
```bash
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"
```

**Pentru Intel Macs:**
Homebrew va fi instalat în `/usr/local/bin/brew` și va fi disponibil automat.

### Pasul 2: Instalează Poppler

După ce Homebrew este instalat, rulează:

```bash
brew install poppler
```

### Pasul 3: Verifică instalarea

Verifică dacă Poppler este instalat corect:

```bash
pdftoppm -v
```

Ar trebui să vezi versiunea Poppler (ex: `pdftoppm version 23.xx.x`).

### Pasul 4: Repornește serverul Next.js

După instalare, repornește serverul Next.js:

1. Oprește serverul (Ctrl+C în terminalul unde rulează)
2. Repornește cu `npm run dev`

## Verificare instalare

După instalare, poți verifica dacă totul funcționează:

```bash
which pdftoppm
pdftoppm -v
```

## Probleme comune

### "command not found: brew"

Homebrew nu este instalat sau nu este în PATH. Verifică:
- Pentru Apple Silicon: `/opt/homebrew/bin/brew`
- Pentru Intel: `/usr/local/bin/brew`

### "Permission denied"

Ai nevoie de permisiuni de administrator pentru a instala Homebrew. Rulează comanda de instalare și introdu parola când este cerută.

### "pdftoppm: command not found" după instalare

1. Verifică că Homebrew este în PATH:
   ```bash
   echo $PATH | grep -E "(homebrew|usr/local)"
   ```

2. Reîncarcă shell-ul:
   ```bash
   source ~/.zprofile
   # sau
   source ~/.zshrc
   ```

3. Verifică din nou:
   ```bash
   which pdftoppm
   ```

## Alternativă: Instalare manuală Poppler (fără Homebrew)

Dacă nu vrei să folosești Homebrew, poți instala Poppler manual:

1. Descarcă Poppler de la: https://poppler.freedesktop.org/
2. Extrage arhiva
3. Adaugă binarele la PATH

**Notă:** Homebrew este metoda recomandată și cea mai simplă pe macOS.





















































