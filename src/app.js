import express from "express";
import cors from "cors";
import { apiRouter } from "./routes/index.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

export const app = express();

// Deployed frontend + local Vite dev server. FRONTEND_URL lets a future
// deploy add/change the allowed origin without a code change.
const allowedOrigins = [
  "http://localhost:5173",
  "https://wb-sdc9.onrender.com",
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({ origin: allowedOrigins }));
// Default express.json() limit is 100kb — too small for the data-URL image
// uploads this app accepts (avatar photos, submission images, both base64
// text in the JSON body). 12mb comfortably covers an 8MB image's ~33% base64
// inflation plus JSON overhead; every other payload in this app is tiny.
app.use(express.json({ limit: "12mb" }));

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api", apiRouter);

// Order matters: notFoundHandler only runs if nothing above matched,
// errorHandler is last so it catches everything (including notFoundHandler's
// own ApiError, via asyncHandler/next(err) throughout the app).
app.use(notFoundHandler);
app.use(errorHandler);
