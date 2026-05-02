import { NextResponse } from 'next/server';
import { getAppleCatalog } from '@/lib/payments/apple/catalog';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const revalidate = 300;

type AppleCatalogResponse = {
  success: true;
  platform: 'ios';
  products: ReturnType<typeof getAppleCatalog>;
};

export async function GET() {
  const products = getAppleCatalog();
  const response: AppleCatalogResponse = {
    success: true,
    platform: 'ios',
    products,
  };

  return NextResponse.json(response, {
    status: 200,
    headers: {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    },
  });
}
