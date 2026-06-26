import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import type { Notification } from "./machine.js";

/** Delivery boundary. v1 ships SNS + console; Telegram would be a new impl behind a flag (SPEC §1). */
export interface Notifier {
  send(notification: Notification): Promise<void>;
}

function subjectFor(n: Notification): string {
  const text =
    n.kind === "outage"
      ? `[Barometer] ${n.displayName}: ${n.status}`
      : `[Barometer] ${n.displayName} recovered`;
  return text.slice(0, 100); // SNS subject limit
}

function bodyFor(n: Notification): string {
  const lines =
    n.kind === "outage"
      ? [`${n.displayName} is reporting ${n.status}.`]
      : [`${n.displayName} has returned to operational.`];
  if (n.incidentTitle) lines.push(`Incident: ${n.incidentTitle}`);
  if (n.incidentUrl) lines.push(n.incidentUrl);
  return lines.join("\n");
}

/** Collects notifications (for dry-run / tests) and logs each as structured JSON. */
export class ConsoleNotifier implements Notifier {
  readonly sent: Notification[] = [];

  async send(notification: Notification): Promise<void> {
    this.sent.push(notification);
    console.log(JSON.stringify({ event: "alert", ...notification }));
  }
}

export class SnsNotifier implements Notifier {
  constructor(
    private readonly topicArn: string,
    private readonly client: SNSClient = new SNSClient({}),
  ) {}

  async send(notification: Notification): Promise<void> {
    await this.client.send(
      new PublishCommand({
        TopicArn: this.topicArn,
        Subject: subjectFor(notification),
        Message: bodyFor(notification),
      }),
    );
  }
}
