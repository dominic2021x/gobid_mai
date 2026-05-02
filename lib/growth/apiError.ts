import { NextResponse } from "next/server";

export type GrowthErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "BAD_REQUEST"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INTERNAL_ERROR";

export function growthJsonError(
  error: string,
  code: GrowthErrorCode,
  status: number,
  correlationId?: string
): NextResponse {
  const body: { error: string; code: string; correlationId?: string } = {
    error,
    code,
  };
  if (correlationId) body.correlationId = correlationId;
  return NextResponse.json(body, { status });
}
