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
                links: [],
                affordances: [{ ref: interaction(ref, "property", "result") }]
              }
            }
          });
        })();
        return accepted(ref);
      }
    },
    context: ({ outcome }) => outcome?.kind === "accepted"
      ? {
          links: [{ rel: "execution", target: outcome.execution }],
          affordances: [
            { ref: interaction(outcome.execution, "property", "status") },
            { ref: interaction(outcome.execution, "event", "updates") }
          ]
        }
      : { links: [], affordances: [] }
  });

  app.bind("Execution", {
    properties: {
      status: async ({ thing: target }) => jobs.has(target.id)
        ? ok(jobs.get(target.id).status) : fail("NOT_FOUND"),
      result: async ({ thing: target }) => {
        const job = jobs.get(target.id);
        if (!job) return fail("NOT_FOUND");
        return job.status === "completed" ? ok(job.text)
          : fail("NOT_READY", "Execution is still running", {
              retry: { mode: "after", after: "PT0.05S" }
            });
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
    context: ({ thing: target }) => jobs.has(target.id)
      ? {
          links: [],
          affordances: [
            { ref: interaction(target, "property", "status") },
            { ref: interaction(target, "property", "result") },
            { ref: interaction(target, "event", "updates") }
          ]
        }
      : { links: [], affordances: [] }
  });
  return app;
}
