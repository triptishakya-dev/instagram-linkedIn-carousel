import { NextResponse } from "next/server";
import { ZodError } from "zod";

/** Every failure the API returns on purpose. */
export type ApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "MEDIA_NOT_FOUND"
  | "MEDIA_REJECTED"
  | "PLATFORM_RULE"
  | "SCHEDULE_WINDOW"
  | "INTERNAL";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    /** Form field this belongs to, so the composer can render it inline. */
    readonly field?: string,
    /**
     * Structured extras for a client that can act on more than the sentence.
     *
     * A conflict is the case in point: "3 goals use this model" is enough to
     * render a warning, but naming the three lets the user recognise what they
     * are about to change. Safe to echo because only the route decides what
     * goes in here.
     */
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function badRequest(message: string, field?: string) {
  return new ApiError(400, "BAD_REQUEST", message, field);
}

type ErrorBody = {
  error: {
    code: ApiErrorCode;
    message: string;
    field?: string;
    issues?: unknown;
    details?: Record<string, unknown>;
  };
};

/**
 * Turns anything thrown inside a route handler into a response. Unexpected
 * errors are logged and flattened to a 500 — never echoed to the client, since
 * the message can carry connection strings or bucket names.
 */
export function toErrorResponse(err: unknown): NextResponse<ErrorBody> {
  if (err instanceof ApiError) {
    return NextResponse.json(
      {
        error: {
          code: err.code,
          message: err.message,
          field: err.field,
          details: err.details,
        },
      },
      { status: err.status },
    );
  }

  if (err instanceof ZodError) {
    const first = err.issues[0];
    return NextResponse.json(
      {
        error: {
          code: "BAD_REQUEST" as const,
          message: first?.message ?? "Invalid request body.",
          field: first?.path.join("."),
          issues: err.issues,
        },
      },
      { status: 400 },
    );
  }

  console.error("[api] unhandled error:", err);
  return NextResponse.json(
    { error: { code: "INTERNAL" as const, message: "Something went wrong." } },
    { status: 500 },
  );
}

/** Reads a JSON body, mapping a malformed one to a 400 instead of a 500. */
export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw badRequest("Request body must be valid JSON.");
  }
}
