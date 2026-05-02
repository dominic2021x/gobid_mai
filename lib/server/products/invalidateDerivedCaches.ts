import { bumpProductsDerivedDataVersion } from "@/lib/server/products/derivedDataVersion";

export async function invalidateProductDerivedCaches(reason: string): Promise<void> {
  try {
    await bumpProductsDerivedDataVersion(reason);
  } catch (error) {
    console.warn("[product-derived-cache] Failed to bump shared cache version:", error);
  }
}
