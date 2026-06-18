import { config } from "./config.js";

/**
 * Push notifications via ntfy.sh: the owner subscribes to the topic in the
 * ntfy mobile/desktop app and gets pinged the moment something needs them.
 * No topic configured = silently off. Failures never break the caller —
 * notifications are best-effort by design.
 */
export type NotifyPriority = "min" | "low" | "default" | "high" | "urgent";

export async function notify(
  title: string,
  message: string,
  opts: { priority?: NotifyPriority; tags?: string[]; click?: string } = {}
): Promise<void> {
  if (!config.ntfyTopic) return;
  try {
    await fetch(`${config.ntfyServer}/${config.ntfyTopic}`, {
      method: "POST",
      body: message,
      headers: {
        Title: title,
        Priority: opts.priority ?? "default",
        ...(opts.tags?.length ? { Tags: opts.tags.join(",") } : {}),
        ...(opts.click ? { Click: opts.click } : {}),
      },
    });
  } catch {
    /* best-effort */
  }
}
