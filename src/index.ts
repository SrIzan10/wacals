import type { CalendarEvent, EventChange } from "./types";
import { redis } from "bun";
import { EventEmitter } from "node:events";
import { Client, LocalAuth } from "whatsapp-web.js";
import qrcode from "qrcode-terminal";
import { getEventChanges } from "./utils/getEventChanges";

const events = new EventEmitter();
const wa = new Client({
  authStrategy: new LocalAuth(),
});

wa.once("ready", async () => {
  console.log("[WA] client ready!");
});
wa.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
});

events.on("eventUpdate", async ({ id, changes }) => {
  const eventData = await redis.get(`cal:${id}`);
  if (!eventData) return;

  const event = JSON.parse(eventData) as CalendarEvent;
  const changeText = changes
    .map((change: EventChange) => `- ${change}`)
    .join("\n");
  const message = `Event ${event.summary} (${event.id}) has been updated:\n${changeText}`;
  await wa.sendMessage(process.env.CHAT_ID!, message);
});

wa.initialize();

Bun.serve({
  port: 3000,
  routes: {
    "/submit": {
      POST: async (request) => {
        if (request.headers.get("authorization") !== process.env.AUTH_KEY) {
          return new Response("Unauthorized", { status: 401 });
        }

        const data = (await request.body?.json()) as CalendarEvent[];

        let globalChanges = await Promise.all(
          data.map(async (incomingEvent) => {
            const storedEventJson = await redis.get(`cal:${incomingEvent.id}`);
            const storedEvent = storedEventJson
              ? (JSON.parse(storedEventJson) as CalendarEvent)
              : null;
            const changes = getEventChanges(storedEvent, incomingEvent);

            await redis.set(
              `cal:${incomingEvent.id}`,
              JSON.stringify(incomingEvent)
            );

            return { id: incomingEvent.id, changes };
          })
        );

        globalChanges.forEach(({ id, changes }) => {
          if (changes.length > 0) {
            events.emit("eventUpdate", { id, changes });
          }
        });

        // slicing because if its more than 5 then something has gone very wrong
        globalChanges = globalChanges.slice(-5);

        console.log("received:", data);
        return new Response(`thanks`);
      },
    },
  },
});
console.log("[HTTP] server running on port 3000");
