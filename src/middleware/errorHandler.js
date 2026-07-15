import { ApiError } from "../utils/ApiError.js";

// Last middleware in the chain (see app.js). Every thrown/rejected error in
// the app funnels here via asyncHandler — this is the only place that
// formats an error response, so the shape is guaranteed consistent.
export function errorHandler(err, req, res, _next) {
  const isApiError = err instanceof ApiError;
  const statusCode = isApiError ? err.statusCode : 500;

  if (!isApiError) {
    // Unexpected error (bug, DB failure, etc.) — log the real thing
    // server-side, never leak internals to the client.
    console.error(`[unhandled] ${req.method} ${req.originalUrl}:`, err);
  }

  res.status(statusCode).json({
    error: {
      message: isApiError ? err.message : "Internal server error",
      code: statusCode,
      ...(isApiError && err.details ? { details: err.details } : {}),
    },
  });
}

export function notFoundHandler(req, _res, next) {
  next(new ApiError(404, `No route for ${req.method} ${req.originalUrl}`));
}
