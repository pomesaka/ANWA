#!/usr/bin/env bun
import { readFileSync, writeFileSync } from "node:fs";
import { Result } from "neverthrow";
import { match } from "ts-pattern";
import {
  validateManifest,
  generateTypes,
  generateManifestModule,
  type Manifest,
} from "../src/schema-tools.ts";

type Command = "validate" | "generate" | "generate-manifest" | "inspect";
const [command, ...args] = process.argv.slice(2);
const validCommands: Command[] = [
  "validate",
  "generate",
  "generate-manifest",
  "inspect",
];
if (!validCommands.includes(command as Command) || args.length === 0) {
  console.error(
    "Usage: bun tools/anwa.ts validate|generate|generate-manifest|inspect <anwa.json> [output]",
  );
  process.exit(2);
}

const load = (path: string): Manifest =>
  JSON.parse(readFileSync(path, "utf8")) as Manifest;

function checkedManifest(path: string): Manifest {
  const manifest = load(path);
  const problems = validateManifest(manifest);
  if (problems.length)
    throw Error(problems.map((x) => x.path + ": " + x.message).join("\n"));
  return manifest;
}

function validateAll(paths: string[]): void {
  let failures = 0;
  for (const path of paths) {
    const diagnostics = validateManifest(load(path));
    if (!diagnostics.length) console.log("VALID " + path);
    else
      for (const diagnostic of diagnostics) {
        console.error(
          "INVALID " + path + " " + diagnostic.path + ": " + diagnostic.message,
        );
        failures++;
      }
  }
  if (failures > 0) process.exitCode = 1;
}

function generate(path: string, target?: string): void {
  const code = generateTypes(checkedManifest(path));
  if (target) {
    writeFileSync(target, code, "utf8");
    console.log("GENERATED " + target);
  } else process.stdout.write(code);
}

function generateManifest(path: string, target?: string): void {
  if (!target) throw Error("generate-manifest requires an output .ts path");
  writeFileSync(target, generateManifestModule(checkedManifest(path)), "utf8");
  const formatted = Bun.spawnSync({
    cmd: ["bun", "fmt", target],
    stdout: "inherit",
    stderr: "inherit",
  });
  if (formatted.exitCode !== 0) throw Error("Bun formatting failed");
  console.log("GENERATED " + target);
}

function inspect(path: string): void {
  const manifest = checkedManifest(path);
  const lines = ["# ANWA " + manifest.anwa + " Interactions", ""];
  for (const [ref, spec] of Object.entries(manifest.interactions)) {
    lines.push("## " + ref + " (" + spec.kind + ")", "", spec.description, "");
    for (const [direction, schema] of [
      ["Input", spec.input],
      ["Output", spec.output],
    ] as const) {
      if (!schema) continue;
      lines.push("- " + direction + ": " + schema.type);
      for (const [field, value] of Object.entries(schema.properties ?? {})) {
        lines.push(
          "  - " + field + ": " + value.type +
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

// Command dispatch is exhaustive. Sync filesystem/parser/format failures are
// handled at one Result boundary rather than a catch-all try/catch statement.
Result.fromThrowable(
  () =>
    match(command as Command)
      .with("validate", () => validateAll(args))
      .with("generate", () => generate(args[0], args[1]))
      .with("generate-manifest", () => generateManifest(args[0], args[1]))
      .with("inspect", () => inspect(args[0]))
      .exhaustive(),
  (cause) => ({
    kind: "tooling-error" as const,
    message: cause instanceof Error ? cause.message : String(cause),
  }),
)().match(
  () => undefined,
  (failure) => {
    console.error("ANWA tooling error:", failure.message);
    process.exitCode = 1;
  },
);
