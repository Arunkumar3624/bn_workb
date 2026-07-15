import { ZodError } from "zod";
import { ApiError } from "../utils/ApiError.js";

// validate(schema) parses req.body and replaces it with the parsed
// (type-coerced, defaulted) result — controllers can trust req.body matches
// the schema exactly. validate(schema, "query") does the same for req.query.
export function validate(schema, source = "body") {
  return (req, _res, next) => {
    try {
      req[source] = schema.parse(req[source]);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        throw ApiError.badRequest("Validation failed.", err.flatten());
      }
      throw err;
    }
  };
}
