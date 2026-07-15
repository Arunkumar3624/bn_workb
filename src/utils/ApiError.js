// Thrown anywhere in a controller/middleware; errorHandler.js turns this
// into the standard { error: { message, code, details } } response shape.
export class ApiError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.details = details;
  }

  static badRequest(message, details) {
    return new ApiError(400, message, details);
  }

  static unauthorized(message = "Unauthorized") {
    return new ApiError(401, message);
  }

  static forbidden(message = "Forbidden") {
    return new ApiError(403, message);
  }

  static notFound(message = "Not found") {
    return new ApiError(404, message);
  }

  static conflict(message, details) {
    return new ApiError(409, message, details);
  }

  static internal(message = "Internal server error") {
    return new ApiError(500, message);
  }
}
