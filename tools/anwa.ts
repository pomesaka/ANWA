#!/usr/bin/env bun
import { readFileSync, writeFileSync } from "node:fs";
import {
  validateManifest,
  generateTypes,
  generateManifestModule,
  type Manifest,
} from "../src/schema-tools.ts";

const [command, ...args] = process.argv.slice(2);
if (
  !["validate", "generate", "generate-manifest", "inspect"].includes(command) ||
  args.length === 0
) {
  console.error(
    "Usage: bun tools/anwa.ts validate|generate|generate-manifest|inspect <anwa.json> [output]",
  );
  process.exit(2);
}
const load = (path: string): Manifest =>
  JSON.parse(readFileSync(path, "utf8")) as Manifest;

try {
  if (command === "validate") {
    let failures = 0;
    for (const path of args) {
      const diagnostics = validateManifest(load(path));
      if (!diagnostics.length) console.log("VALID " + path);
      else
        for (const diagnostic of diagnostics) {
          console.error(
            "INVALID " +
              path +
              " " +
              diagnostic.path +
              ": " +
              diagnostic.message,
          );
          failures++;
        }
    }
    if (failures > 0) process.exitCode = 1;
  } else {
    const manifest = load(args[0]);
    const problems = validateManifest(manifest);
    if (problems.length)
      throw Error(problems.map((x) => x.path + ": " + x.message).join("\n"));
    if (command === "generate") {
      const code = generateTypes(manifest);
      if (args[1]) {
        writeFileSync(args[1], code, "utf8");
        console.log("GENERATED " + args[1]);
      } else process.stdout.write(code);
    } else if (command === "generate-manifest") {
      if (!args[1]) throw Error("generate-manifest requires an output .ts path");
      writeFileSync(args[1], generateManifestModule(manifest), "utf8");
      const formatted = Bun.spawnSync({
        cmd: ["bun", "fmt", args[1]],
        stdout: "inherit",
        stderr: "inherit",
      });
      if (formatted.exitCode !== 0) throw Error("Bun formatting failed");
      console.log("GENERATED " + args[1]);
    } else {
      const lines = ["# ANWA " + manifest.anwa + " Interactions", ""];
      for (const [ref, spec] of Object.entries(manifest.interactions)) {
        lines.push(
          "## " + ref + " (" + spec.kind + ")",
          "",
          spec.description,
          "",
        );
        for (const [direction, schema] of [
          ["Input", spec.input],
          ["Output", spec.output],
        ] as const) {
          if (!schema) continue;
          lines.push("- " + direction + ": " + schema.type);
          for (const [field, value] of Object.entries(
            schema.properties ?? {},
          )) {
            lines.push(
              "  - " +
                field +
                ": " +
                value.type +
                (schema.required?.includes(field) ? " (required)" : "") +
                (value.description ? " — " + value.description : ""),
            );
          }
        }
        if (spec.guard) lines.push("- Guard: " + spec.guard);
        for (const [code, description] of Object.entries(spec.errors ?? {}))
          lines.push("- Error " + code + ": " + description);
        lines.push("");
      }
      process.stdout.write(lines.join("\n") + "\n");
    }
  }
} catch (error) {
  console.error(
    "ANWA tooling error:",
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
}
