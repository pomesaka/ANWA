/**
 * Experimental ANWA 0.1 author tooling.
 * Intentionally supports only the JSON Schema subset implemented by src/anwa.mjs.
 * This is NOT a full JSON Schema 2020-12 implementation.
 */
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const ERROR_CODE = /^[A-Z][A-Z0-9_]*$/;
const RESERVED = new Set(["INVALID_INPUT", "UNEXPECTED_ERROR"]);
const DATA_TYPES = new Set(["string", "number", "integer", "boolean", "object", "array", "null"]);
const SCHEMA_KEYS = new Set(["type", "enum", "properties", "required", "items", "additionalProperties", "description"]);

export function validateManifest(manifest) {
  const errors = [];
  const issue = (path, message) => errors.push({ path, message });
  const record = value => !!value && typeof value === "object" && !Array.isArray(value);
  const description = (value, path) => {
    if (typeof value !== "string" || !value.trim()) issue(path, "Must be a nonempty description");
  };
  const keys = (object, allowed, path) => {
    for (const key of Object.keys(object)) {
      if (!allowed.includes(key)) issue(path + "." + key, "Unknown field");
    }
  };
  function dataSchema(schema, path) {
    if (!record(schema)) { issue(path, "Expected a data schema object"); return; }
    for (const key of Object.keys(schema)) {
      if (!SCHEMA_KEYS.has(key)) issue(path + "." + key, "Unsupported JSON Schema keyword in v0.1 reference runtime");
    }
    if (!DATA_TYPES.has(schema.type)) issue(path + ".type", "Expected a supported type");
    if (schema.description !== undefined) description(schema.description, path + ".description");
    if (schema.enum !== undefined && (!Array.isArray(schema.enum) || !schema.enum.length)) {
      issue(path + ".enum", "Expected nonempty array");
    }
    if (schema.type === "object") {
      if (schema.properties !== undefined && !record(schema.properties)) {
        issue(path + ".properties", "Expected property map");
      }
      for (const [k, v] of Object.entries(record(schema.properties) ? schema.properties : {})) {
        dataSchema(v, path + ".properties." + k);
      }
      if (schema.required !== undefined) {
        if (!Array.isArray(schema.required) || !schema.required.every(k => typeof k === "string")) {
          issue(path + ".required", "Expected array of field names");
        } else {
          for (const name of schema.required) {
            if (!Object.hasOwn(schema.properties ?? {}, name)) issue(path + ".required", "Undeclared required field: " + name);
          }
        }
      }
      if (schema.additionalProperties !== undefined && schema.additionalProperties !== false) {
        issue(path + ".additionalProperties", "Only false is explicitly supported by this reference runtime");
      }
    } else if (schema.properties !== undefined || schema.required !== undefined || schema.additionalProperties !== undefined) {
      issue(path, "Object-only fields on a non-object type");
    }
    if (schema.type === "array") {
      if (!schema.items) issue(path + ".items", "Array items schema required");
      else dataSchema(schema.items, path + ".items");
    } else if (schema.items !== undefined) {
      issue(path + ".items", "items is only supported for array");
    }
  }
  if (!record(manifest)) return [{ path: "$", message: "Expected object" }];
  keys(manifest, ["anwa", "entrypoints", "things"], "$");
  if (manifest.anwa !== "0.1") issue("$.anwa", "Expected ANWA 0.1");
  if (!record(manifest.things) || !Object.keys(manifest.things).length) {
    issue("$.things", "Expected nonempty Thing map");
  }
  for (const [thing, model] of Object.entries(record(manifest.things) ? manifest.things : {})) {
    const path = "$.things." + thing;
    if (!IDENTIFIER.test(thing)) issue(path, "Thing name must be an identifier for interface generation");
    if (!record(model)) { issue(path, "Expected Thing object"); continue; }
    keys(model, ["title", "description", "properties", "actions", "events", "links"], path);
    description(model.title, path + ".title");
    description(model.description, path + ".description");
    for (const bucket of ["properties", "actions", "events"]) {
      if (model[bucket] !== undefined && !record(model[bucket])) {
        issue(path + "." + bucket, "Expected interaction map");
        continue;
      }
      for (const [name, op] of Object.entries(record(model[bucket]) ? model[bucket] : {})) {
        const at = path + "." + bucket + "." + name;
        if (!IDENTIFIER.test(name)) issue(at, "Interaction name must be an identifier");
        if (!record(op)) { issue(at, "Expected interaction object"); continue; }
        keys(op, ["description", "input", "output", "guard", "errors"], at);
        description(op.description, at + ".description");
        for (const k of ["input", "output"]) if (op[k] !== undefined) dataSchema(op[k], at + "." + k);
        if (op.guard !== undefined && (bucket !== "actions" || typeof op.guard !== "string" || !op.guard)) {
          issue(at + ".guard", "Guard must be a named nonempty Action guard");
        }
        if (op.errors !== undefined) {
          if (!record(op.errors)) issue(at + ".errors", "Expected map of domain error code to description");
          else for (const [code, help] of Object.entries(op.errors)) {
            if (!ERROR_CODE.test(code)) issue(at + ".errors." + code, "Expected uppercase code");
            if (RESERVED.has(code)) issue(at + ".errors." + code, "Reserved framework error");
            description(help, at + ".errors." + code);
          }
        }
      }
    }
    if (model.links !== undefined && !record(model.links)) issue(path + ".links", "Expected Link map");
    for (const [name, link] of Object.entries(record(model.links) ? model.links : {})) {
      const at = path + ".links." + name;
      if (!record(link)) { issue(at, "Expected Link object"); continue; }
      keys(link, ["target", "description"], at);
      description(link.description, at + ".description");
      if (!Object.hasOwn(manifest.things ?? {}, link.target)) {
        issue(at + ".target", "Unknown Thing type: " + String(link.target));
      }
    }
  }
  if (!Array.isArray(manifest.entrypoints) || !manifest.entrypoints.length) {
    issue("$.entrypoints", "Expected nonempty array of ThingRefs");
  } else for (const [i, ref] of manifest.entrypoints.entries()) {
    const at = "$.entrypoints[" + i + "]";
    if (!record(ref) || typeof ref.id !== "string" || !ref.id ||
        typeof ref.type !== "string" || !ref.type || !Object.hasOwn(manifest.things ?? {}, ref.type)) {
      issue(at, "Expected a ThingRef with declared type and nonempty string id");
    }
  }
  return errors;
}

function typeFor(schema) {
  if (!schema) return "null";
  if (Array.isArray(schema.enum)) return schema.enum.map(x => JSON.stringify(x)).join(" | ");
  switch (schema.type) {
    case "string": return "string";
    case "number":
    case "integer": return "number";
    case "boolean": return "boolean";
    case "null": return "null";
    case "array": return "Array<" + typeFor(schema.items) + ">";
    case "object": {
      const fields = Object.entries(schema.properties ?? {});
      if (!fields.length) return "Record<string, unknown>";
      const required = new Set(schema.required ?? []);
      return "{ " + fields.map(([name, value]) => JSON.stringify(name) +
        (required.has(name) ? ": " : "?: ") + typeFor(value) + ";").join(" ") + " }";
    }
    default: return "unknown";
  }
}

export function generateTypes(manifest) {
  const issues = validateManifest(manifest);
  if (issues.length) {
    throw new Error("Cannot generate types:\n" + issues.map(x => x.path + " " + x.message).join("\n"));
  }
  const out = [
    "// AUTO-GENERATED by ANWA 0.1 tooling. Do not edit by hand.",
    "// Type/interface definitions only; they contain no business logic or runtime validation.",
    'export type ThingRef = { type: string; id: string };',
    'export type Result<T, E extends string> =',
    '  | { ok: true; value: T }',
    '  | { ok: false; error: { code: E; message?: string; details?: unknown; retry?: unknown; effects?: string } };',
    'export type Accepted = { kind: "accepted"; execution: ThingRef };',
    'export type InvocationResult<T, E extends string> = Result<T, E> | Accepted;',
    'export type HandlerArgs<Input> = { thing: ThingRef; input: Input; app: unknown };',
    'export type Handler<T, E extends string, Input = undefined> = (args: HandlerArgs<Input>) => InvocationResult<T, E> | Promise<InvocationResult<T, E>>;',
    ""
  ];
  for (const [type, model] of Object.entries(manifest.things)) {
    for (const [bucket, suffix] of [["properties","Property"],["actions","Action"],["events","Event"]]) {
      for (const [name, spec] of Object.entries(model[bucket] ?? {})) {
        const prefix = type + name[0].toUpperCase() + name.slice(1) + suffix;
        const errors = [...Object.keys(spec.errors ?? {}), "INVALID_INPUT", "UNEXPECTED_ERROR"];
        out.push("export type " + prefix + "Input = " + (spec.input ? typeFor(spec.input) : "undefined") + ";");
        out.push("export type " + prefix + "Output = " + (spec.output ? typeFor(spec.output) : "null") + ";");
        out.push("export type " + prefix + "ErrorCode = " + errors.map(x => JSON.stringify(x)).join(" | ") + ";");
        if (suffix !== "Event") {
          out.push("export type " + prefix + "Handler = Handler<" + prefix + "Output, " +
            prefix + "ErrorCode, " + prefix + "Input>;");
        } else {
          out.push("export type " + prefix + "Observation = AsyncIterable<unknown>;");
        }
        out.push("");
      }
    }
  }
  return out.join("\n") + "\n";
}
