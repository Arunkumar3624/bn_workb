import { getIO, userRoom, projectRoom } from "./socket.js";

// One event name, discriminated by `type`, so the frontend only ever needs
// one listener per surface — future events (e.g. a chat message, once that
// feature exists) extend the `type` union instead of adding new channels.
// Emitted to both participants' private rooms (so a toast lands regardless
// of which page they're on) and the project room (for anyone actively
// viewing that project). No-ops if the socket server hasn't been started
// (e.g. under a script/test that never calls initSocket).
export function emitProjectEvent(project, type, payload = {}) {
  const io = getIO();
  if (!io) return;

  const event = { type, projectId: project.id, ...payload };
  io.to(userRoom(project.worker_id)).emit("project:event", event);
  io.to(userRoom(project.business_id)).emit("project:event", event);
  io.to(projectRoom(project.id)).emit("project:event", event);
}
