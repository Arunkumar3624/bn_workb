import { Router } from "express";
import { authRouter } from "./auth.routes.js";
import { projectsRouter } from "./projects.routes.js";
import { walletRouter } from "./wallet.routes.js";
import { reviewsRouter } from "./reviews.routes.js";
import { profilesRouter } from "./profiles.routes.js";
import { adminRouter } from "./admin.routes.js";

export const apiRouter = Router();

apiRouter.use("/auth", authRouter); // register/login are the other unguarded routes
apiRouter.use("/projects", projectsRouter);
apiRouter.use("/wallet", walletRouter);
apiRouter.use("/reviews", reviewsRouter);
apiRouter.use("/profiles", profilesRouter); // the one unguarded resource
apiRouter.use("/admin", adminRouter);

// Dev-only token issuance — never mounted in production. See dev.routes.js.
if (process.env.NODE_ENV !== "production") {
  const { devRouter } = await import("./dev.routes.js");
  apiRouter.use("/dev", devRouter);
}
