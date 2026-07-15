import express from "express";
import cors from "cors";
import { apiRouter } from "./routes/index.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

export const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api", apiRouter);

// Order matters: notFoundHandler only runs if nothing above matched,
// errorHandler is last so it catches everything (including notFoundHandler's
// own ApiError, via asyncHandler/next(err) throughout the app).
app.use(notFoundHandler);
app.use(errorHandler);
