import { getFocalForImageUrl } from "@/lib/image/focal-from-product";
import { CDN_IMAGE_WIDTH, getCdnImageUrl, heroTransformOptions } from "@/lib/image/cdn";
import { mapProductRowToAuction } from "./mapProductRowToAuction";

const DEFAULT_DPR = 2;

export type LiveBidResolvedImageUrls = {
  hero: string[];
  thumb: string[];
};

/**
 * Aceleași URL-uri ca în `ProgressiveImage` / `productImageCdn().thumb`, dar calculate pe server
 * și trimise ca props — HTML-ul SSR și primul render client folosesc **exact** aceleași stringuri
 * (evită hidratare stricată când bundlerul client are chunk vechi la `getCdnImageUrl`).
 */
export function buildResolvedLiveBidImageUrls(
  row: Record<string, unknown> | null | undefined,
): LiveBidResolvedImageUrls | undefined {
  if (!row) return undefined;
  const auction = mapProductRowToAuction(row);
  if (!auction.images?.length) return undefined;
  const v = auction.imageVersionAt ?? null;
  const hero = auction.images.map((img) =>
    getCdnImageUrl(img, heroTransformOptions(v, getFocalForImageUrl(auction, img))),
  );
  const thumb = auction.images.map((img) =>
    getCdnImageUrl(img, {
      width: CDN_IMAGE_WIDTH.thumb,
      height: CDN_IMAGE_WIDTH.thumb,
      fit: "cover",
      quality: 78,
      format: "auto",
      dpr: DEFAULT_DPR,
      updatedAt: v,
    }),
  );
  return { hero, thumb };
}
