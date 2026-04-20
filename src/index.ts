import type { CalendarEvent, EventChange } from "./types";
import { redis } from "bun";
import { EventEmitter } from "node:events";
import { Client, LocalAuth } from "whatsapp-web.js";
import qrcode from "qrcode-terminal";
import { formatEventDate } from "./utils/formatEventDate";
import { getEventChanges } from "./utils/getEventChanges";
import { getEventStartTime } from "./utils/getEventStartTime";
import { lstatSync, rmSync } from "node:fs";
import { join } from "node:path";

const authDataPath = join(process.cwd(), ".wwebjs_auth");
const sessionPath = join(authDataPath, "session");

// Chromium writes these as symlinks, so lstat is needed to catch stale broken entries.
for (const name of ["SingletonLock", "SingletonCookie", "SingletonSocket"]) {
  const fullPath = join(sessionPath, name);
  try {
    lstatSync(fullPath);
    rmSync(fullPath, { force: true });
    console.log(`[WA] removed stale lock file: ${fullPath}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

const events = new EventEmitter();
const wa = new Client({
  authStrategy: new LocalAuth({ dataPath: authDataPath }),
  puppeteer: {
    args:
      process.env.NODE_ENV === "production"
        ? ["--no-sandbox", "--disable-setuid-sandbox"]
        : [],
  },
});

let isShuttingDown = false;

const shutdown = async (signal: NodeJS.Signals) => {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log(`[APP] received ${signal}, shutting down`);

  try {
    await wa.destroy();
  } catch (error) {
    console.error("[WA] failed to destroy client", error);
  } finally {
    process.exit(0);
  }
};

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

wa.once("ready", async () => {
  console.log("[WA] client ready!");
});
wa.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
});

events.on("eventUpdate", async ({ changes, previousEvent, currentEvent }) => {
  const getEventTitle = (event: CalendarEvent | null) =>
    event?.summary ?? "sin título";

  const changeMap = {
    created: `📅➕ Creado para *${formatEventDate(currentEvent, "start")}*`,
    summaryUpdate: `📝 Nombre: ${getEventTitle(previousEvent)} → *${getEventTitle(
      currentEvent,
    )}*`,
    startUpdate: `🕐 Inicio: ${formatEventDate(
      previousEvent,
      "start",
    )} → *${formatEventDate(currentEvent, "start")}*`,
    endUpdate: `🕑 Fin: ${formatEventDate(
      previousEvent,
      "end",
    )} → *${formatEventDate(currentEvent, "end")}*`,
  } satisfies Record<EventChange, string>;

  const changeText = changes
    .map((change: EventChange) => `- ${changeMap[change]}`)
    .join("\n");
  const message = `Cambio en el Calendar para *${getEventTitle(currentEvent)}*:\n${changeText}`;
  await wa.sendMessage(process.env.CHAT_ID!, message);
});

wa.initialize().catch((error) => {
  console.error("[WA] failed to initialize client", error);
  process.exit(1);
});

Bun.serve({
  port: 3000,
  routes: {
    "/submit": {
      POST: async (request) => {
        if (request.headers.get("authorization") !== process.env.AUTH_KEY) {
          return new Response("Unauthorized", { status: 401 });
        }

        const data = ((await request.body?.json()) as CalendarEvent[]).sort(
          (left, right) => getEventStartTime(left) - getEventStartTime(right),
        );

        let globalChanges = await Promise.all(
          data.map(async (incomingEvent) => {
            const storedEventJson = await redis.get(`cal:${incomingEvent.id}`);
            const storedEvent = storedEventJson
              ? (JSON.parse(storedEventJson) as CalendarEvent)
              : null;
            const changes = getEventChanges(storedEvent, incomingEvent);

            await redis.set(
              `cal:${incomingEvent.id}`,
              JSON.stringify(incomingEvent),
            );

            return {
              id: incomingEvent.id,
              changes,
              previousEvent: storedEvent,
              currentEvent: incomingEvent,
            };
          }),
        );

        // slicing because if its more than 5 then something has gone very wrong
        globalChanges = globalChanges.slice(-5);

        globalChanges.forEach(
          ({ id, changes, previousEvent, currentEvent }) => {
            if (changes.length > 0) {
              events.emit("eventUpdate", {
                id,
                changes,
                previousEvent,
                currentEvent,
              });
            }
          },
        );

        return new Response(`thanks`);
      },
    },
  },
});
console.log("[HTTP] server running on port 3000");
