# Cum să restartezi serverul pentru a recunoaște noul API route

API-ul `/api/report-chat/hide` există dar serverul Next.js nu îl recunoaște.

## Soluție 1: Restart simplu
```bash
# Oprește serverul (Ctrl+C în terminal)
# Apoi repornește:
npm run dev
```

## Soluție 2: Curățare cache + Restart (Recomandat)
```bash
# Oprește serverul (Ctrl+C)
# Șterge cache-ul:
rm -rf .next
# Repornește:
npm run dev
```

## Verificare
După restart, încearcă să ștergi din nou "Raportare Useri". Ar trebui să funcționeze fără eroare 404.
