# Componente pentru Produse Blocate

## 🎯 Scop
Aceste componente asigură un design consistent pentru toate produsele blocate din aplicație.

## 📦 Componente

### 1. `LockedContent.tsx`
Component pentru produsele blocate cu designul galben frumos.

**Props:**
- `location: string` - Locația produsului
- `seller: string` - Numele vânzătorului
- `participants: string` - Numărul de participanți
- `isDarkMode: boolean` - Modul întunecat
- `onUnlock: () => void` - Funcția de deblocare
- `userTokens: number` - Numărul de tokeni ai utilizatorului
- `disabled?: boolean` - Dacă butonul este dezactivat

### 2. `UnlockedContent.tsx`
Component pentru produsele deblocate.

**Props:**
- `location: string` - Locația produsului
- `seller: string` - Numele vânzătorului
- `participants: string` - Numărul de participanți
- `isDarkMode: boolean` - Modul întunecat

### 3. `AuctionContent.tsx`
Component principal care combină ambele componente.

**Props:**
- `isUnlocked: boolean` - Dacă produsul este deblocat
- `location: string` - Locația produsului
- `seller: string` - Numele vânzătorului
- `participants: string` - Numărul de participanți
- `isDarkMode: boolean` - Modul întunecat
- `onUnlock: () => void` - Funcția de deblocare
- `userTokens: number` - Numărul de tokeni ai utilizatorului
- `disabled?: boolean` - Dacă butonul este dezactivat

## 🚀 Utilizare

```tsx
import AuctionContent from '../components/AuctionContent';

// În componenta ta
<AuctionContent
  isUnlocked={isAuctionUnlocked(auction.id)}
  location={auction.location}
  seller={auction.seller}
  participants="8 participanți"
  isDarkMode={isDarkMode}
  onUnlock={() => handleUnlockAuction(auction.id)}
  userTokens={userTokens.balance}
  disabled={userTokens.balance < 1}
/>
```

## 🎨 Design
- **Culori galbene** pentru butoane și iconițe de token
- **Efect blur** pentru conținutul blocat
- **Iconițe Heroicons** pentru consistență
- **Responsive** pentru toate dispozitivele

## 📝 Note
- Toate componentele sunt optimizate pentru performanță
- Designul este consistent în toată aplicația
- Ușor de personalizat și extins
