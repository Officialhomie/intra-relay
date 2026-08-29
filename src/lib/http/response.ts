/** Uniform API response envelope (docs/rules patterns.md). */

export interface ApiOk<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: { code: string; message: string; details?: unknown };
}

export function ok<T>(data: T, status = 200): Response {
  return Response.json({ success: true, data } satisfies ApiOk<T>, { status });
}

export function created<T>(data: T): Response {
  return ok(data, 201);
}

/** A thrown error that maps to an HTTP status + stable error code. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return Response.json(
      {
        success: false,
        error: { code: error.code, message: error.message, details: error.details },
      } satisfies ApiError,
      { status: error.status },
    );
  }
  // Never leak internals (NFR-SEC-002).
  console.error("Unhandled API error:", error);
  return Response.json(
    {
      success: false,
      error: { code: "INTERNAL", message: "Something went wrong." },
    } satisfies ApiError,
    { status: 500 },
  );
}
