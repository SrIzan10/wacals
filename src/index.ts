import type { CalendarEvent, ClassroomItem, ClassroomItemChange, EventChange } from "./types";
import { redis } from "bun";
import { EventEmitter } from "node:events";
import { Client, LocalAuth } from "whatsapp-web.js";
import qrcode from "qrcode-terminal";
import { formatEventDate } from "./utils/formatEventDate";
import { getEventChanges } from "./utils/getEventChanges";
import { getEventStartTime } from "./utils/getEventStartTime";
import { getClassroomItemChanges } from "./utils/getClassroomItemChanges";
import { getClassroomItemTime } from "./utils/getClassroomItemTime";
import { styleDate } from "./utils/styleDate";
import { truncate } from "./utils/truncate";
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

const CLASSROOM_TYPE_INFO = {
  courseWork: { emoji: "📚", label: "tarea" },
  courseWorkMaterial: { emoji: "📎", label: "material" },
  announcement: { emoji: "📢", label: "anuncio" },
} satisfies Record<ClassroomItem["type"], { emoji: string; label: string }>;

const CLASSROOM_STATE_LABELS: Record<string, string> = {
  PUBLISHED: "publicado",
  DRAFT: "borrador",
  DELETED: "eliminado",
};

const getClassroomItemTitle = (item: ClassroomItem | null) =>
  item?.title ?? truncate(item?.text, 60) ?? "sin título";

events.on(
  "classroomUpdate",
  async ({ changes, previousItem, currentItem }: {
    changes: ClassroomItemChange[];
    previousItem: ClassroomItem | null;
    currentItem: ClassroomItem;
  }) => {
    const { emoji, label } = CLASSROOM_TYPE_INFO[currentItem.type];
    const lines: string[] = [];

    if (changes.includes("created")) {
      lines.push(`${emoji} Nuevo *${label}* en *${currentItem.courseName}*`);

      if (currentItem.type === "announcement") {
        lines.push(truncate(currentItem.text, 300) ?? "");
      } else {
        lines.push(`*${currentItem.title}*`);
      }

      if (currentItem.dueDateTime) {
        lines.push(`🕐 Entrega: ${styleDate(currentItem.dueDateTime)}`);
      }
    } else {
      lines.push(
        `✏️ Cambio en *${label}* de *${currentItem.courseName}*: *${getClassroomItemTitle(currentItem)}*`,
      );

      const changeMap = {
        titleUpdate: `📝 Título: ${getClassroomItemTitle(previousItem)} → *${getClassroomItemTitle(currentItem)}*`,
        dueDateUpdate: `🕐 Entrega: ${
          previousItem?.dueDateTime ? styleDate(previousItem.dueDateTime) : "sin fecha"
        } → *${currentItem.dueDateTime ? styleDate(currentItem.dueDateTime) : "sin fecha"}*`,
        stateUpdate: `📌 Estado: ${CLASSROOM_STATE_LABELS[previousItem?.state ?? ""] ?? previousItem?.state ?? "?"} → *${CLASSROOM_STATE_LABELS[currentItem.state] ?? currentItem.state}*`,
      } satisfies Record<Exclude<ClassroomItemChange, "created">, string>;

      changes.forEach((change) => {
        if (change !== "created") {
          lines.push(`- ${changeMap[change]}`);
        }
      });
    }

    if (currentItem.alternateLink) {
      lines.push(currentItem.alternateLink);
    }

    await wa.sendMessage(process.env.CHAT_ID!, lines.join("\n"));
  },
);

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
    "/classroom": {
      POST: async (request) => {
        if (request.headers.get("authorization") !== process.env.AUTH_KEY) {
          return new Response("Unauthorized", { status: 401 });
        }

        const data = ((await request.body?.json()) as ClassroomItem[]).sort(
          (left, right) => getClassroomItemTime(left) - getClassroomItemTime(right),
        );

        let globalChanges = await Promise.all(
          data.map(async (incomingItem) => {
            const storedItemJson = await redis.get(
              `classroom:${incomingItem.id}`,
            );
            const storedItem = storedItemJson
              ? (JSON.parse(storedItemJson) as ClassroomItem)
              : null;
            const changes = getClassroomItemChanges(storedItem, incomingItem);

            await redis.set(
              `classroom:${incomingItem.id}`,
              JSON.stringify(incomingItem),
            );

            return {
              id: incomingItem.id,
              changes,
              previousItem: storedItem,
              currentItem: incomingItem,
            };
          }),
        );

        // slicing because if its more than 5 then something has gone very wrong
        globalChanges = globalChanges.slice(-5);

        globalChanges.forEach(
          ({ id, changes, previousItem, currentItem }) => {
            // drafts aren't visible to students yet, so don't spam the group chat
            if (changes.length > 0 && currentItem.state !== "DRAFT") {
              events.emit("classroomUpdate", {
                id,
                changes,
                previousItem,
                currentItem,
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
