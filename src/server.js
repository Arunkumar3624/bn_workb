import "dotenv/config";
import dns from "node:dns";
import http from "node:http";
import { app } from "./app.js";
import { initSocket } from "./realtime/socket.js";

// Some hosts (Render's containers among them) can resolve a hostname's IPv6
// address via DNS but can't actually route to it, failing with ENETUNREACH —
// hit exactly this connecting to smtp.hostinger.com, which publishes both an
// A and AAAA record. Preferring IPv4 first avoids ever attempting a
// connection over a network path that doesn't work here.
dns.setDefaultResultOrder("ipv4first");

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
