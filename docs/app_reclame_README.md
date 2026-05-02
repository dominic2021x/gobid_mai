# Reclame / Banere

Bannerul afișat pe pagina `/ro` vine din acest folder.

## Cum schimbi reclama

- **Varianta 1:** Editează `AuctionsBanner.tsx` – schimbi textul, imaginile, linkurile.
- **Varianta 2:** Creezi un fișier nou (ex. `NewCampaignBanner.tsx`) cu același tip de props (`isDarkMode`, `onClose`), apoi în `index.ts` înlocuiești:
  ```ts
  export { default as CurrentBanner } from "./NewCampaignBanner";
  ```

Bannerul curent este „Anunțurile de Licitații” (1 Token). Vizibilitatea (închis/deschis) se salvează în `localStorage` cu cheia `auctionsBannerHidden`; pentru o nouă campanie poți folosi altă cheie în pagina care afișează bannerul.
