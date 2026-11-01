import { readFileSync } from "node:fs";
import {
  AnwaApp,
  accepted,
  fail,
  ok,
  reply,
  type Manifest,
} from "../../src/anwa.ts";

const schema = JSON.parse(
  readFileSync(new URL("./anwa.json", import.meta.url), "utf8"),
) as Manifest;
const sleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));
type ReportEvent =
  | { type: "state.changed"; sequence: number; state: string }
  | { type: "artifact.delta"; sequence: number; data: string }
  | { type: "settled"; sequence: number; response: ReturnType<typeof reply> };
interface ReportJob {
  status: "accepted" | "running" | "completed";
  events: ReportEvent[];
  text: string;
}

export function createReports(): AnwaApp {
  const jobs = new Map<string, ReportJob>();
  let nextId = 1;

  return new AnwaApp(schema).bind({
    "report.generate": async ({ input }) => {
      const executionId = String(nextId++);
      const job: ReportJob = { status: "accepted", events: [], text: "" };
      jobs.set(executionId, job);
      // Ephemeral local work: no cross-process durability or replay guarantee.
      void (async () => {
        await sleep(5);
        job.status = "running";
        job.events.push({
          type: "state.changed",
          sequence: 1,
          state: job.status,
        });
        for (const chunk of [
          "Report: " + input.topic + "\n",
          "Summary: generated in two parts.\n",
        ]) {
          await sleep(5);
          job.text += chunk;
          job.events.push({
            type: "artifact.delta",
            sequence: job.events.length + 1,
            data: chunk,
          });
        }
        job.status = "completed";
        job.events.push({
          type: "settled",
          sequence: job.events.length + 1,
          response: reply(ok(job.text), [
            {
              ref: "execution.result",
              input: { executionId },
              guidance: { level: "recommended" },
            },
          ]),
        });
      })();

      return reply(accepted(executionId), [
        {
          ref: "execution.status",
          input: { executionId },
          guidance: { level: "available" },
        },
        {
          ref: "execution.updates",
          input: { executionId },
          guidance: { level: "recommended" },
        },
      ]);
    },

    "execution.status": async ({ input }) => {
      const job = jobs.get(input.executionId);
      if (!job) return reply(fail("NOT_FOUND", "Unknown execution"));
      return reply(ok(job.status), [
        {
          ref: "execution.updates",
          input: { executionId: input.executionId },
          guidance: { level: "available" },
        },
      ]);
    },

    "execution.result": async ({ input }) => {
      const executionId: string = input.executionId;
      const job = jobs.get(executionId);
      if (!job) return reply(fail("NOT_FOUND", "Unknown execution"));
      if (job.status === "completed") return reply(ok(job.text));
      return reply(
        fail("NOT_READY", "Execution still running", { effects: "none" }),
        [
          {
            ref: "execution.result",
            input: { executionId },
            guidance: { kind: "retry", level: "recommended" },
            when: { after: "PT0.05S" },
          },
          {
            ref: "execution.status",
            input: { executionId },
            guidance: { level: "available" },
          },
          {
            ref: "execution.updates",
            input: { executionId },
            guidance: { level: "available" },
          },
        ],
      );
    },

    "execution.updates": ({ input, cursor = 0 }) =>
      (async function* (): AsyncGenerator<ReportEvent> {
        const job = jobs.get(input.executionId);
        if (!job) throw Error("Unknown execution");
        let index = cursor;
        while (true) {
          while (index < job.events.length) yield job.events[index++];
          if (job.status === "completed") return;
          await sleep(2);
        }
      })(),
  });
}
