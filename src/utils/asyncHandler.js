// Wraps an async route/controller so a rejected promise (thrown ApiError, or
// any unexpected exception) reaches Express's error-handling middleware
// instead of becoming an unhandled rejection. Every controller in this repo
// goes through this — none of them should carry a try/catch of their own.
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
