import { readFileSync } from "node:fs";
import { AnwaApp, accepted, fail, interaction, ok, thing } from "../../src/anwa.mjs";
const schema = JSON.parse(readFileSync(new URL("./anwa.json", import.meta.url), "utf8"));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export const reportServiceRef = thing("ReportService", "main");

export function createReports() {
  const jobs = new Map();
  let nextId = 1;
  const app = new AnwaApp(schema);

  app.bind("ReportService", {
    actions: {
      generate: async ({ input }) => {
        const ref = thing("Execution", String(nextId++));
        const job = { ref, status: "accepted", events: [], text: "" };
        jobs.set(ref.id, job);
        // Ephemeral local task: no persistence, retries or network-delivery guarantee.
        void (async () => {
          await sleep(5);
          job.status = "running";
          job.events.push({
            type: "state.changed", sequence: job.events.length + 1, state: job.status
          });
          for (const chunk of ["Report: " + input.topic + "\n",
                              "Summary: generated in two parts.\n"]) {
            await sleep(5);
            job.text += chunk;
            job.events.push({
              type: "artifact.delta", sequence: job.events.length + 1, data: chunk
            });
          }
          job.status = "completed";
          job.events.push({
            type: "settled",
            sequence: job.events.length + 1,
            response: {
              outcome: { kind: "settled", result: ok(job.text) },
              context: {
                next: [{ ref: interaction(ref, "property", "result"),
                  guidance: { level: "recommended" } }]
              }
            }
          });
        })();
        return accepted(ref);
      }
    },
    context: ({ outcome }) => outcome?.kind === "accepted"
      ? {
          next: [
            { ref: interaction(outcome.execution, "property", "status"),
              guidance: { level: "available" } },
            { ref: interaction(outcome.execution, "event", "updates"),
              guidance: { level: "recommended" } }
          ]
        }
      : { next: [] }
  });

  app.bind("Execution", {
    properties: {
      status: async ({ thing: target }) => jobs.has(target.id)
        ? ok(jobs.get(target.id).status) : fail("NOT_FOUND"),
      result: async ({ thing: target }) => {
        const job = jobs.get(target.id);
        if (!job) return fail("NOT_FOUND");
        return job.status === "completed" ? ok(job.text)
          : fail("NOT_READY", "Execution is still running");
      }
    },
    events: {
      updates: ({ thing: target, cursor = 0 }) => (async function* () {
        const job = jobs.get(target.id);
        if (!job) throw new Error("Unknown execution");
        let index = cursor;
        while (true) {
          while (index < job.events.length) yield job.events[index++];
          if (job.status === "completed") return;
          await sleep(2);
        }
      })()
    },
    context: ({ thing: target, interaction: source, outcome }) => {
      const job = jobs.get(target.id);
      if (!job) return { next: [] };
      const next = [
        { ref: interaction(target, "property", "status"),
          guidance: { level: "available" } },
        { ref: interaction(target, "event", "updates"),
          guidance: { level: job.status === "completed" ? "available" : "recommended" } }
      ];
      if (job.status === "completed") {
        next.push({ ref: interaction(target, "property", "result"),
          guidance: { level: "recommended" } });
      } else if (source?.name === "result" &&
                 outcome?.kind === "settled" &&
                 outcome.result?.error?.code === "NOT_READY") {
        next.push({
          ref: interaction(target, "property", "result"),
          guidance: { kind: "retry", level: "recommended" },
          when: { after: "PT0.05S" }
        });
      }
      return { next };
    }
  });
  return app;
}
