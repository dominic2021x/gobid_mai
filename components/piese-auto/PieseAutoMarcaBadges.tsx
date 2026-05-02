import { cn } from "@/lib/utils";
import {
  getMarcaFromListing,
  isPieseAutoListingProduct,
  type ListingMarcaFields,
} from "@/lib/piese-auto/listing-marca";

const marcaBadgeClass =
  "inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] sm:text-xs font-semibold backdrop-blur-sm shadow-md bg-blue-500/85 text-white";

/** Colț stânga sus pe imagine (ex. pagină magazin); `z-10` sub favorite dreapta. */
export function PieseAutoMarcaCornerBadge({
  listing,
  className,
  badgeClassName,
  stopPropagationOnClick = true,
}: {
  listing: ListingMarcaFields;
  className?: string;
  badgeClassName?: string;
  stopPropagationOnClick?: boolean;
}) {
  if (!isPieseAutoListingProduct(listing)) return null;
  const marca = getMarcaFromListing(listing);
  if (!marca) return null;
  return (
    <div
      className={cn("absolute top-1 left-1 z-10 md:top-2 md:left-2", className)}
      onClick={stopPropagationOnClick ? (e) => e.stopPropagation() : undefined}
    >
      <span className={cn(marcaBadgeClass, badgeClassName)}>{marca}</span>
    </div>
  );
}

/** Doar `<span>`-ul albastru — pentru stack în `flex flex-col` cu alte badge-uri. */
export function PieseAutoMarcaInlineSpan({
  listing,
  className,
}: {
  listing: ListingMarcaFields;
  className?: string;
}) {
  if (!isPieseAutoListingProduct(listing)) return null;
  const marca = getMarcaFromListing(listing);
  if (!marca) return null;
  return <span className={cn(marcaBadgeClass, className)}>{marca}</span>;
}
