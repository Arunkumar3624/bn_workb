import { Server } from "socket.io";
import { isAllowedOrigin } from "../app.js";
import { verifyAccessToken } from "../middleware/guard.js";
import * as projectsRepo from "../repositories/projects.repository.js";

let io = null;

export function userRoom(userId) {
  return `user:${userId}`;
}

export function projectRoom(projectId) {
  return `project:${projectId}`;
}

// The realtime counterpart of guard.js — same JWT, same secret, same
// payload contract. A socket that fails this never finishes connecting
// (no bare-authenticated-by-default connection).
function authenticate(socket, next) {
  try {
    socket.user = verifyAccessToken(socket.handshake.auth?.token);
    next();
  } catch {
    next(new Error("unauthorized"));
  }
}

// Mirrors submissions.controller.js's mustBeParticipant — a client can ask
// to join a project room, but never gets in without the server independently
// confirming they're the worker, business, or an admin on that project.
async function handleProjectJoin(socket, projectId, ack) {
  if (typeof ack !== "function") return;
  const project = await projectsRepo.findById(projectId);
  if (!project) return ack({ ok: false, error: "Not found" });

  const isParticipant = project.worker_id === socket.user.id || project.business_id === socket.user.id;
  if (!isParticipant && socket.user.role !== "admin") {
    return ack({ ok: false, error: "Forbidden" });
  }

  socket.join(projectRoom(projectId));
  ack({ ok: true });
}

export function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: (origin, callback) => callback(null, isAllowedOrigin(origin)) },
  });

  io.use(authenticate);

  io.on("connection", (socket) => {
    socket.join(userRoom(socket.user.id));

    socket.on("project:join", (projectId, ack) => {
      handleProjectJoin(socket, projectId, ack).catch(() => ack?.({ ok: false, error: "Server error" }));
    });
  });

  return io;
}

export function getIO() {
  return io;
}
