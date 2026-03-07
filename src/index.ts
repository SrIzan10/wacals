import type { CalendarEvent, EventChange } from "./types";
import { redis } from "bun";
import { EventEmitter } from "node:events";
import { Client, LocalAuth } from "whatsapp-web.js";
import qrcode from "qrcode-terminal";
import { getEventChanges } from "./utils/getEventChanges";
import { styleDate } from "./utils/styleDate";

const events = new EventEmitter();
const wa = new Client({
  authStrategy: new LocalAuth(),
});

function formatEventDate(event: CalendarEvent | null, key: "start" | "end") {
  const value = event?.[key].dateTime ?? event?.[key].date;
  return value ? styleDate(value) : "fecha desconocida";
}

wa.once("ready", async () => {
  console.log("[WA] client ready!");
});
wa.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
});

events.on("eventUpdate", async ({ changes, previousEvent, currentEvent }) => {
  const changeMap = {
    created: `📅➕ *${currentEvent.summary}* el *${formatEventDate(currentEvent, "start")}*`,
    summaryUpdate: `📄✏️ *${previousEvent?.summary}* → *${currentEvent.summary}*.`,
    startUpdate: `📅✏️ *${formatEventDate(previousEvent, "start")}* → *${formatEventDate(currentEvent, "start")}*.`,
    endUpdate: `📅✏️ *${formatEventDate(previousEvent, "end")}* → *${formatEventDate(currentEvent, "end")}*.`,
  } satisfies Record<EventChange, string>;

  const changeText = changes
    .map((change: EventChange) => `- ${changeMap[change]}`)
    .join("\n");
  const message = `Nuevo cambio en el Calendar:\n${changeText}`;
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

            return {
              id: incomingEvent.id,
              changes,
              previousEvent: storedEvent,
              currentEvent: incomingEvent,
            };
          })
        );

        // slicing because if its more than 5 then something has gone very wrong
        globalChanges = globalChanges.slice(-5);

        globalChanges.forEach(({ id, changes, previousEvent, currentEvent }) => {
          if (changes.length > 0) {
            events.emit("eventUpdate", { id, changes, previousEvent, currentEvent });
          }
        });

        console.log("received:", data);
        return new Response(`thanks`);
      },
    },
  },
});
console.log("[HTTP] server running on port 3000");
