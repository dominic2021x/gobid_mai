import { Suspense } from "react";
import FavoritesPage from "../dashboard/favorites/page";

export default function FavoritesRoutePage() {
  return (
    <Suspense fallback={null}>
      <FavoritesPage />
    </Suspense>
  );
}
