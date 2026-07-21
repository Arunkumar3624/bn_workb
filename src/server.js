import "dotenv/config";
import http from "node:http";
import { app } from "./app.js";
import { initSocket } from "./realtime/socket.js";

const port = process.env.PORT || 4000;

// Socket.IO attaches to the same underlying HTTP server Express serves
// from — one port, one process, matching the single-Render-instance
// deployment (see DEPLOYMENT.md). Its own /socket.io/* traffic is
// intercepted before it ever reaches the Express middleware chain.
const server = http.createServer(app);
initSocket(server);

server.listen(port, () => {
  console.log(`WorkBridge API listening on :${port}`);
});
