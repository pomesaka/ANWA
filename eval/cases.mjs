import { createCalculator, calculatorRef } from "../demo/calculator/index.mjs";
import { createOrders, orderRef } from "../demo/orders/index.mjs";
import { createReports, reportServiceRef } from "../demo/reports/index.mjs";

const attempted = (trace, kind, name) => trace.filter(x =>
  x.action?.action === "interact" && x.action.ref?.kind === kind &&
  x.action.ref?.name === name);
const foundValue = (trace, kind, name, expected) =>
  attempted(trace, kind, name).some(x =>
    x.observation?.outcome?.kind === "settled" &&
    x.observation?.outcome?.result?.ok === true &&
    x.observation?.outcome?.result?.value === expected);
const foundError = (trace, name, code) =>
  attempted(trace, "action", name).some(x =>
    x.observation?.outcome?.result?.error?.code === code);
const answered = (answer, regex) => regex.test(answer || "");

export const cases = [
  {
    id: "calculator-divide",
    app: createCalculator,
    goal: "Compute 12 divided by 3 using the service, then tell me the answer.",
    grade: ({ trace, answer }) => ({
      passed: foundValue(trace, "action", "divide", 4) && answered(answer, /\b4\b/),
      evidence: "Invoked divide(12,3), obtained value 4, and reported 4."
    })
  },
  {
    id: "calculator-domain-error",
    app: createCalculator,
    goal: "Try dividing 10 by zero using the service. Report the exact error code and whether it succeeded.",
    grade: ({ trace, answer }) => ({
      passed: foundError(trace, "divide", "DIVIDE_BY_ZERO") &&
        answered(answer, /DIVIDE_BY_ZERO/) &&
        answered(answer, /fail|cannot|error|失敗|できない|不可|ゼロ除算/i),
      evidence: "Observed declared domain error rather than inventing an answer."
    })
  },
  {
    id: "orders-cancel-pending",
    app: createOrders,
    goal: "Cancel order 'pending' with reason 'Changed my mind', verify its latest status, then report the result.",
    grade: ({ trace, answer }) => {
      const cancel = attempted(trace, "action", "cancel")
        .some(x => x.action.ref?.thing?.id === "pending" &&
          x.action.input?.reason === "Changed my mind" &&
          x.observation?.outcome?.result?.ok === true);
      const verified = attempted(trace, "property", "summary")
        .some(x => x.action.ref?.thing?.id === "pending" &&
          x.observation?.outcome?.result?.value?.status === "cancelled");
      return { passed: cancel && verified && answered(answer,/cancel|取消|キャンセル/i),
        evidence: "Canceled pending order, verified updated summary, and reported cancellation." };
    }
  },
  {
    id: "orders-shipped-navigation",
    app: createOrders,
    goal: "Check whether order 'shipped' can still be canceled. If not, check the related shipment's tracking state and explain what you found. Do not attempt an action if Discovery says it is blocked.",
    grade: ({ trace, answer }) => {
      const blocked = trace.some(x => x.action?.action === "discover" &&
        x.action.thing?.type === "Order" &&
        x.action.thing?.id === "shipped" &&
        x.observation?.context?.affordances?.some(a =>
          a.ref?.name === "cancel" && a.applicability?.state === "blocked"));
      const tracked = foundValue(trace, "property", "tracking", "delivered");
      const unsafeCalls = attempted(trace, "action", "cancel")
        .filter(x => x.action.ref?.thing?.id === "shipped").length;
      return { passed: blocked && tracked && unsafeCalls === 0 &&
        answered(answer, /shipp|dispatch|deliver|cancel|発送|配送|配達|キャンセル/i),
        evidence: "Recognized blocked cancel, followed shipment ref, read tracking, avoided blocked action." };
    }
  },
  {
    id: "reports-async",
    app: createReports,
    goal: "Generate a report about 'ANWA'. Wait for its final completion using the advertised events, then tell me whether it completed and what its output says.",
    grade: ({ trace, answer }) => {
      const accepted = attempted(trace, "action", "generate").some(x =>
        x.action.input?.topic === "ANWA" && x.observation?.outcome?.kind === "accepted");
      const finished = trace.some(x => x.action?.action === "observe" &&
        x.observation?.events?.some(e => e.type === "settled" &&
          e.response?.outcome?.result?.ok === true &&
          /Report: ANWA/.test(e.response?.outcome?.result?.value || "")));
      return { passed: accepted && finished && answered(answer, /ANWA/i),
        evidence: "Distinguished accepted from completed, observed terminal event and reported output." };
    }
  }
];

export function getCase(id) {
  const candidate=cases.find(c=>c.id===id);
  if (!candidate) throw new Error("Unknown evaluation case: " + id);
  return candidate;
}
