#!/usr/bin/env node
// ANWA 0.1 experimental developer tools; no dependencies.
import { readFileSync, writeFileSync } from "node:fs";
import { validateManifest, generateTypes } from "../src/schema-tools.mjs";

const [command, ...args] = process.argv.slice(2);
if (!["validate", "generate", "inspect"].includes(command) || !args.length) {
  console.error([
    "Usage:",
    "  node tools/anwa.mjs validate <anwa.json> [another-anwa.json ...]",
    "  node tools/anwa.mjs generate <anwa.json> [output.d.ts]",
    "  node tools/anwa.mjs inspect <anwa.json>"
  ].join("\n"));
  process.exit(2);
}

function load(path) {
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch (e) { throw new Error("Cannot read JSON: " + path + ": " + e.message); }
}
try {
  if (command === "validate") {
    let problems = 0;
    for (const path of args) {
      const diagnostics = validateManifest(load(path));
      if (!diagnostics.length) console.log("VALID " + path);
      else {
        problems += diagnostics.length;
        for (const d of diagnostics) console.error("INVALID " + path + " " + d.path + ": " + d.message);
      }
    }
    if (problems) process.exitCode = 1;
  } else {
    const schema = load(args[0]);
    const diagnostics = validateManifest(schema);
    if (diagnostics.length) {
      for (const d of diagnostics) console.error("INVALID " + d.path + ": " + d.message);
      process.exitCode = 1;
    } else if (command === "generate") {
      const types = generateTypes(schema);
      if (args[1]) {
        writeFileSync(args[1], types, "utf8");
        console.log("GENERATED " + args[1]);
      } else process.stdout.write(types);
    } else {
      const lines = [
        "# " + schema.entrypoints[0].type + " — ANWA 0.1",
        "",
        "## Published Things",
        ""
      ];
      for (const [name, thing] of Object.entries(schema.things)) {
        lines.push("### " + thing.title + " (`" + name + "`)", "", thing.description, "");
        for (const [bucket, label] of [["properties","Property"], ["actions","Action"], ["events","Event"]]) {
          for (const [op, detail] of Object.entries(thing[bucket] ?? {})) {
            lines.push("- **" + label + " `" + op + "`** — " + detail.description);
            for (const [direction, dataSchema] of [["Input", detail.input], ["Output", detail.output]]) {
              if (!dataSchema) continue;
              lines.push("  - " + direction + ": " + dataSchema.type +
                (dataSchema.description ? " — " + dataSchema.description : ""));
              if (dataSchema.type === "object") {
                const required = new Set(dataSchema.required ?? []);
                for (const [field, spec] of Object.entries(dataSchema.properties ?? {})) {
                  lines.push("    - `" + field + "`: " + spec.type +
                    (required.has(field) ? " (required)" : " (optional)") +
                    (spec.description ? " — " + spec.description : ""));
                }
              }
            }
            if (detail.guard) lines.push("  - Named guard: `" + detail.guard + "`");
            if (detail.errors) for (const [code, meaning] of Object.entries(detail.errors)) {
              lines.push("  - Error `" + code + "`: " + meaning);
            }
          }
        }
        for (const [name, link] of Object.entries(thing.links ?? {})) {
          lines.push("- **Link `" + name + "`** → `" + link.target + "` — " + link.description);
        }
        lines.push("");
      }
      lines.push("References are resolved by the application; this document does not define its workflow.");
      process.stdout.write(lines.join("\n") + "\n");
    }
  }
} catch (e) {
  console.error("ANWA tooling error: " + e.message);
  process.exitCode = 1;
}
