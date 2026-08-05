import * as projectsRepo from "../repositories/projects.repository.js";
import { sendPushToUser } from "./push.service.js";

// Render runs this backend as a single, always-on Node process (not
// serverless) — an in-process interval is a legitimate scheduler here, no
// separate cron infra needed. Every 6 hours is plenty for a day-granularity
// deadline column; the immediate call at startup (see server.js) covers the
// gap between deploys instead of waiting up to 6h for the first check.
export async function checkAndSendDeadlineReminders() {
  let dueProjects;
  try {
    dueProjects = await projectsRepo.listDueForDeadlineReminder();
  } catch (err) {
    console.error("[deadline-reminders] Could not query due projects:", err);
    return;
  }

  for (const project of dueProjects) {
    const body = `"${project.title}" is due tomorrow.`;
    if (project.worker_id) {
      await sendPushToUser(project.worker_id, { title: "Deadline tomorrow", body, url: `/worker/negotiations?invite=${project.id}` });
    }
    await sendPushToUser(project.business_id, { title: "Deadline tomorrow", body, url: "/business" });

    // Marked immediately after sending (not batched) so a mid-loop crash
    // doesn't re-send to projects already handled earlier in this same run.
    await projectsRepo.markDeadlineReminderSent(project.id);
  }
}

export function startDeadlineReminderScheduler() {
  const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
  checkAndSendDeadlineReminders();
  setInterval(checkAndSendDeadlineReminders, SIX_HOURS_MS);
}
