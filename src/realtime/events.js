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
  if (project.worker_id) io.to(userRoom(project.worker_id)).emit("project:event", event);
  io.to(userRoom(project.business_id)).emit("project:event", event);
  io.to(projectRoom(project.id)).emit("project:event", event);
}

// The job board's candidate events (a new invite, "this job was filled by
// someone else") target one specific user who isn't necessarily a
// participant on the project yet — an OPEN project's worker_id is null, so
// emitProjectEvent above can't reach an invited/applying worker at all.
// Same "user:<id>" room every socket already auto-joins on connect (see
// realtime/socket.js), just addressed directly instead of derived from a
// project row.
export function emitToUser(userId, type, payload = {}) {
  const io = getIO();
  if (!io) return;

  io.to(userRoom(userId)).emit("project:event", { type, ...payload });
}
