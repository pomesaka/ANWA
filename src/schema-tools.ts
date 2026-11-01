/** ANWA v0.2 — Interaction-first schema validation and type generation. */
export type PrimitiveType =
  "object" | "array" | "string" | "number" | "integer" | "boolean" | "null";
export interface DataSchema {
  type?: PrimitiveType;
  $ref?: string;
  description?: string;
  enum?: readonly unknown[];
  properties?: Readonly<Record<string, DataSchema>>;
  required?: readonly string[];
  items?: DataSchema;
  additionalProperties?: false;
}
export interface InteractionDefinition {
  kind: "query" | "action" | "event";
  description: string;
  input?: DataSchema;
  output?: DataSchema;
  errors?: Readonly<Record<string, string>>;
  semanticTypes?: readonly string[];
  guard?: string;
  hasSideEffects?: boolean;
  idempotent?: boolean;
}
export interface Manifest {
  anwa: "0.2";
  $defs?: Readonly<Record<string, DataSchema>>;
  entrypoints: readonly string[];
  interactions: Readonly<Record<string, InteractionDefinition>>;
}
export interface Diagnostic {
  path: string;
  message: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const has = (value: object, field: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, field);
const identifier = /^[A-Za-z_$][\w$]*(?:[.-][A-Za-z_$][\w$]*)*$/;
const supportedTypes = new Set([
  "object",
  "array",
  "string",
  "number",
  "integer",
  "boolean",
  "null",
]);
const payloadFields = new Set([
  "type",
  "description",
  "enum",
  "properties",
  "required",
  "items",
  "additionalProperties",
]);
const reserved = new Set(["INVALID_INPUT", "UNEXPECTED_ERROR"]);
const definitionName = /^[A-Za-z_$][\w$]*$/;
const definitionRef = /^#\/\$defs\/([A-Za-z_$][\w$]*)$/;

export function validateManifest(manifest: unknown): Diagnostic[] {
  const issues: Diagnostic[] = [];
  const definitions =
    isRecord(manifest) && isRecord(manifest.$defs) ? manifest.$defs : {};
  const issue = (path: string, message: string): void => {
    issues.push({ path, message });
  };
  const checkFields = (
    value: Record<string, unknown>,
    accepted: string[],
    path: string,
  ): void => {
    for (const field of Object.keys(value))
      if (!accepted.includes(field)) issue(path + "." + field, "Unknown field");
  };
  const nonempty = (value: unknown, path: string): void => {
    if (typeof value !== "string" || !value.trim())
      issue(path, "Expected nonempty string");
  };
  const validateData = (schema: unknown, path: string): void => {
    if (!isRecord(schema)) {
      issue(path, "Expected payload schema");
      return;
    }
    if (has(schema, "$ref")) {
      if (Object.keys(schema).length !== 1)
        issue(path, "$ref must be the only schema keyword");
      const ref =
        typeof schema.$ref === "string" ? definitionRef.exec(schema.$ref) : null;
      if (!ref || !has(definitions, ref[1]))
        issue(path + ".$ref", "Unknown or unsupported local schema reference");
      return;
    }
    for (const key of Object.keys(schema))
      if (!payloadFields.has(key))
        issue(path + "." + key, "Unsupported schema keyword");
    if (!supportedTypes.has(schema.type as string))
      issue(path + ".type", "Unsupported schema type");
    if (schema.description !== undefined)
      nonempty(schema.description, path + ".description");
    if (
      schema.enum !== undefined &&
      (!Array.isArray(schema.enum) || schema.enum.length === 0)
    )
      issue(path + ".enum", "Expected nonempty array");
    if (schema.type === "object") {
      if (schema.properties !== undefined && !isRecord(schema.properties))
        issue(path + ".properties", "Expected map");
      for (const [key, item] of Object.entries(
        isRecord(schema.properties) ? schema.properties : {},
      )) {
        validateData(item, path + ".properties." + key);
      }
      if (schema.required !== undefined) {
        if (
          !Array.isArray(schema.required) ||
          schema.required.some((k) => typeof k !== "string")
        )
          issue(path + ".required", "Expected string array");
        else
          for (const key of schema.required as string[]) {
            if (!has(isRecord(schema.properties) ? schema.properties : {}, key))
              issue(path + ".required", "Unknown required field " + key);
          }
      }
      if (
        schema.additionalProperties !== undefined &&
        schema.additionalProperties !== false
      )
        issue(path + ".additionalProperties", "Only false is supported");
    } else if (
      schema.properties !== undefined ||
      schema.required !== undefined ||
      schema.additionalProperties !== undefined
    ) {
      issue(path, "Object-only keywords on a non-object schema");
    }
    if (schema.type === "array") {
      if (schema.items === undefined)
        issue(path + ".items", "Required for arrays");
      else validateData(schema.items, path + ".items");
    } else if (schema.items !== undefined)
      issue(path + ".items", "Only arrays have items");
  };

  if (!isRecord(manifest))
    return [{ path: "$", message: "Expected manifest object" }];
  checkFields(manifest, ["anwa", "$defs", "entrypoints", "interactions"], "$");
  if (manifest.$defs !== undefined) {
    if (!isRecord(manifest.$defs)) issue("$.$defs", "Expected definition map");
    else {
      for (const [name, schema] of Object.entries(definitions)) {
        if (!definitionName.test(name))
          issue("$.$defs." + name, "Invalid definition name");
        validateData(schema, "$.$defs." + name);
      }
      const dependencies = (schema: unknown): string[] => {
        if (!isRecord(schema)) return [];
        if (typeof schema.$ref === "string") {
          const ref = definitionRef.exec(schema.$ref);
          return ref ? [ref[1]] : [];
        }
        return [
          ...(isRecord(schema.properties) ? Object.values(schema.properties) : []),
          ...(schema.items === undefined ? [] : [schema.items]),
        ].flatMap(dependencies);
      };
      const visiting = new Set<string>();
      const visited = new Set<string>();
      const visit = (name: string): void => {
        if (visiting.has(name)) {
          issue("$.$defs." + name, "Cyclic schema reference");
          return;
        }
        if (visited.has(name)) return;
        visiting.add(name);
        for (const dependency of dependencies(definitions[name]))
          if (has(definitions, dependency)) visit(dependency);
        visiting.delete(name);
        visited.add(name);
      };
      for (const name of Object.keys(definitions)) visit(name);
    }
  }
  if (manifest.anwa !== "0.2") issue("$.anwa", "Expected ANWA 0.2");
  if (
    !isRecord(manifest.interactions) ||
    Object.keys(manifest.interactions).length === 0
  )
    issue("$.interactions", "Expected nonempty Interaction map");
  const interactions = isRecord(manifest.interactions)
    ? manifest.interactions
    : {};
  for (const [ref, value] of Object.entries(interactions)) {
    const path = "$.interactions." + ref;
    if (!identifier.test(ref)) issue(path, "Invalid InteractionRef");
    if (!isRecord(value)) {
      issue(path, "Expected Interaction definition");
      continue;
    }
    checkFields(
      value,
      [
        "kind",
        "description",
        "input",
        "output",
        "errors",
        "semanticTypes",
        "guard",
        "hasSideEffects",
        "idempotent",
      ],
      path,
    );
    if (!["query", "action", "event"].includes(value.kind as string))
      issue(path + ".kind", "Expected query, action or event");
    nonempty(value.description, path + ".description");
    if (value.semanticTypes !== undefined) {
      if (
        !Array.isArray(value.semanticTypes) ||
        !value.semanticTypes.length ||
        value.semanticTypes.some(
          (x) => typeof x !== "string" || !/^(https?:\/\/|urn:)[^\s]+$/.test(x),
        ) ||
        new Set(value.semanticTypes).size !== value.semanticTypes.length
      )
        issue(path + ".semanticTypes", "Expected unique URI/URN array");
    }
    for (const field of ["hasSideEffects", "idempotent"]) {
      if (
        value[field] !== undefined &&
        (value.kind !== "action" || typeof value[field] !== "boolean")
      )
        issue(path + "." + field, "Action-only optional boolean");
    }
    if (
      value.guard !== undefined &&
      (typeof value.guard !== "string" || !value.guard)
    )
      issue(path + ".guard", "Expected nonempty named Guard");
    for (const direction of ["input", "output"])
      if (value[direction] !== undefined)
        validateData(value[direction], path + "." + direction);
    if (value.errors !== undefined) {
      if (!isRecord(value.errors))
        issue(path + ".errors", "Expected map of error codes");
      else
        for (const [code, meaning] of Object.entries(value.errors)) {
          if (!/^[A-Z][A-Z0-9_]*$/.test(code) || reserved.has(code))
            issue(path + ".errors." + code, "Invalid or reserved error code");
          nonempty(meaning, path + ".errors." + code);
        }
    }
  }
  if (!Array.isArray(manifest.entrypoints) || manifest.entrypoints.length === 0)
    issue("$.entrypoints", "Expected nonempty InteractionRef array");
  else
    for (const [index, ref] of manifest.entrypoints.entries()) {
      if (typeof ref !== "string" || !has(interactions, ref))
        issue("$.entrypoints[" + index + "]", "Undeclared InteractionRef");
    }
  return issues;
}

function typeOf(
  schema?: DataSchema,
  definitions: Readonly<Record<string, DataSchema>> = {},
): string {
  if (!schema) return "undefined";
  if (schema.$ref) return typeOf(definitions[schema.$ref.slice(8)], definitions);
  if (schema.enum) return schema.enum.map((x) => JSON.stringify(x)).join(" | ");
  switch (schema.type) {
    case "string":
      return "string";
    case "number":
    case "integer":
      return "number";
    case "boolean":
      return "boolean";
    case "null":
      return "null";
    case "array":
      return "Array<" + typeOf(schema.items, definitions) + ">";
    case "object": {
      const fields = Object.entries(schema.properties ?? {});
      const required = new Set(schema.required ?? []);
      return fields.length
        ? "{ " +
            fields
              .map(
                ([name, value]) =>
                  JSON.stringify(name) +
                  (required.has(name) ? ": " : "?: ") +
                  typeOf(value, definitions) +
                  ";",
              )
              .join(" ") +
            " }"
        : "Record<string, unknown>";
    }
    default:
      return "unknown";
  }
}
export function generateTypes(manifest: Manifest): string {
  const problems = validateManifest(manifest);
  if (problems.length)
    throw new Error(problems.map((x) => x.path + ": " + x.message).join("\n"));
  const lines = [
    "// Generated ANWA 0.2 declarations — do not edit.",
    "export type InteractionRef = string;",
    "export type ExecutionRef = {id: string};",
    'export type Result<T,E extends string> = {ok:true;value:T}|{ok:false;error:{code:E;message?:string;effects?:"none"|"occurred"|"unknown"}};',
    'export type Accepted = {kind:"accepted";execution:ExecutionRef};',
    "export type Handler<I,O,E extends string> = (args:{ref:InteractionRef;input:I;app:unknown}) => Result<O,E>|Accepted|Promise<Result<O,E>|Accepted>;",
    "",
  ];
  for (const [ref, spec] of Object.entries(manifest.interactions)) {
    const prefix = ref
      .split(/[._:-]/)
      .map((x) => x[0].toUpperCase() + x.slice(1))
      .join("");
    lines.push("export type " + prefix + "Input = " + typeOf(spec.input, manifest.$defs) + ";");
    lines.push(
      "export type " +
        prefix +
        "Output = " +
        (spec.output ? typeOf(spec.output, manifest.$defs) : "null") +
        ";",
    );
    lines.push(
      "export type " +
        prefix +
        "ErrorCode = " +
        [...Object.keys(spec.errors ?? {}), "INVALID_INPUT", "UNEXPECTED_ERROR"]
          .map((x) => JSON.stringify(x))
          .join(" | ") +
        ";",
    );
    if (spec.kind === "event")
      lines.push(
        "export type " + prefix + "Observation = AsyncIterable<unknown>;",
      );
    else
      lines.push(
        "export type " +
          prefix +
          "Handler = Handler<" +
          prefix +
          "Input," +
          prefix +
          "Output," +
          prefix +
          "ErrorCode>;",
      );
    lines.push("");
  }
  return lines.join("\n") + "\n";
}

/** Compile reusable local schemas into standalone literal schemas for type inference. */
function expandDataSchema(
  schema: DataSchema,
  definitions: Readonly<Record<string, DataSchema>>,
): DataSchema {
  if (schema.$ref)
    return expandDataSchema(definitions[schema.$ref.slice(8)], definitions);
  if (schema.type === "object" && schema.properties)
    return {
      ...schema,
      properties: Object.fromEntries(
        Object.entries(schema.properties).map(([key, value]) => [
          key,
          expandDataSchema(value, definitions),
        ]),
      ),
    };
  if (schema.type === "array" && schema.items)
    return { ...schema, items: expandDataSchema(schema.items, definitions) };
  return schema;
}

/** Generate a literal, type-checked module from the public JSON manifest.
 * The JSON file remains the single author-maintained source. */
export function generateManifestModule(manifest: Manifest): string {
  const problems = validateManifest(manifest);
  if (problems.length)
    throw new Error(problems.map((x) => x.path + ": " + x.message).join("\n"));
  const definitions = manifest.$defs ?? {};
  const expanded: Manifest = {
    anwa: manifest.anwa,
    entrypoints: manifest.entrypoints,
    interactions: Object.fromEntries(
      Object.entries(manifest.interactions).map(([ref, spec]) => [
        ref,
        {
          ...spec,
          ...(spec.input ? { input: expandDataSchema(spec.input, definitions) } : {}),
          ...(spec.output ? { output: expandDataSchema(spec.output, definitions) } : {}),
        },
      ]),
    ),
  };
  return [
    "// AUTO-GENERATED from anwa.json; do not edit. Run bun run codegen.",
    'import type { Manifest } from "../../src/schema-tools.ts";',
    "export const schema = " +
      JSON.stringify(expanded, null, 2) +
      " as const satisfies Manifest;",
    "",
  ].join("\n");
}
