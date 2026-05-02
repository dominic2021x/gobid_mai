# Instalare Poppler - Ghid Rapid

## Problema
Sistemul de extragere PDF necesită Poppler pentru a procesa PDF-uri scanate folosind OCR.

## Soluție Rapidă

### Opțiunea 1: Script automat (recomandat)

Deschide Terminalul și rulează:

```bash
cd /Users/dominicmihai/Desktop/gobid_ro3
bash install-poppler.sh
```

Scriptul va:
- Verifica dacă Poppler este deja instalat
- Instala Homebrew dacă este necesar (va cere parola)
- Instala Poppler
- Verifica instalarea

### Opțiunea 2: Instalare manuală pas cu pas

#### Pasul 1: Instalează Homebrew

Deschide Terminalul și rulează:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

**Pentru Apple Silicon Macs (M1/M2/M3):**
După instalare, adaugă Homebrew la PATH:

```bash
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"
```

#### Pasul 2: Instalează Poppler

```bash
brew install poppler
```

#### Pasul 3: Verifică instalarea

```bash
pdftoppm -v
```

Ar trebui să vezi versiunea Poppler (ex: `pdftoppm version 23.xx.x`).

## După instalare

**IMPORTANT:** Repornește serverul Next.js:

1. Oprește serverul (Ctrl+C în terminalul unde rulează)
2. Repornește cu: `npm run dev`

## Verificare

După instalare și repornire, poți verifica dacă totul funcționează:

```bash
which pdftoppm
pdftoppm -v
```

## Probleme comune

### "command not found: brew"
Homebrew nu este instalat sau nu este în PATH. Urmează Pasul 1 din Opțiunea 2.

### "Permission denied"
Ai nevoie de permisiuni de administrator. Rulează comenzile și introdu parola când este cerută.

### "pdftoppm: command not found" după instalare
1. Verifică că Homebrew este în PATH: `echo $PATH | grep homebrew`
2. Reîncarcă shell-ul: `source ~/.zprofile` sau `source ~/.zshrc`
3. Repornește serverul Next.js

## Suport

Dacă întâmpini probleme, verifică:
- Logurile serverului Next.js pentru detalii despre erori
- Dacă Poppler este în PATH: `which pdftoppm`
- Versiunea Poppler: `pdftoppm -v`





















































