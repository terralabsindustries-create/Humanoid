import { buildApp } from "@/app.js";
import { env } from "@/config/env.js";
import { abandonStaleCalls } from "@/modules/conversations/conversation.service.js";
import { liveVoiceCallSids } from "@/modules/telephony/voice-session.service.js";
import { liveGatherCallSids } from "@/modules/telephony/ai-receptionist.js";

const app = await buildApp();

/**
 * Nothing survives a restart: live call state is an in-memory map keyed by
 * CallSid, so every conversation still marked active at boot is a leftover
 * from a process that is gone. Left alone they show as permanently live calls
 * in the sidebar and live rail — a dashboard lying about the present.
 */
try {
  const closed = await abandonStaleCalls({ olderThanMs: 0, activeCallSids: [] });
  if (closed > 0) app.log.info(`Closed ${closed} call(s) left active by a previous process`);
} catch (err) {
  app.log.error(err, "Could not close stale calls at boot");
}

/**
 * The same leak while running: a row is opened by the inbound webhook, and a
 * caller who hangs up while it rings means the media socket never connects and
 * nothing ever ends it. Calls with a live session are excluded by CallSid, so
 * a real conversation is never swept out from under itself.
 */
const STALE_SWEEP_INTERVAL_MS = 60_000;
const STALE_AFTER_MS = 5 * 60_000;

const sweep = setInterval(() => {
  void abandonStaleCalls({
    olderThanMs: STALE_AFTER_MS,
    activeCallSids: [...liveVoiceCallSids(), ...liveGatherCallSids()],
  })
    .then((closed) => {
      if (closed > 0) app.log.info(`Closed ${closed} abandoned call(s)`);
    })
    .catch((err: unknown) => app.log.error(err, "Stale call sweep failed"));
}, STALE_SWEEP_INTERVAL_MS);
// Don't hold the process open just for the sweep.
sweep.unref();

try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    app.log.info(`Received ${signal}, shutting down`);
    clearInterval(sweep);
    app
      .close()
      .catch((err: unknown) => app.log.error(err))
      .finally(() => process.exit(0));
  });
}
