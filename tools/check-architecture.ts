/** Repository policy, deliberately separate from executable ANWA behavior specifications. */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const collect = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collect(path);
    return entry.isFile() && path.endsWith(".ts") ? [path] : [];
  });
const violations: string[] = [];
for (const scope of ["src", "demo", "test", "tools"]) {
  for (const path of collect(join(root, scope))) {
    const source = ts.createSourceFile(
      path,
      readFileSync(path, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const report = (node: ts.Node, reason: string) => {
      const { line } = source.getLineAndCharacterOfPosition(
        node.getStart(source),
      );
      violations.push(`${relative(root, path)}:${line + 1}: ${reason}`);
    };
    const visit = (node: ts.Node, nesting = 0): void => {
      // Every function has its own control-flow budget; data/type declarations do not count.
      const parentDepth = ts.isFunctionLike(node) ? 0 : nesting;
      const branch = ts.isIfStatement(node) || ts.isConditionalExpression(node);
      const depth = parentDepth + Number(branch);
      if (ts.isClassDeclaration(node) || ts.isClassExpression(node))
        report(
          node,
          "use a factory and explicit dependencies, not an authored class",
        );
      if (node.kind === ts.SyntaxKind.ThisKeyword || ts.isThisTypeNode(node))
        report(node, "public operations must not depend on a receiver");
      if (ts.isCatchClause(node))
        report(node, "use a typed Result boundary, not a catch clause");
      if (scope !== "test" && branch && depth > 2)
        report(
          node,
          "conditional nesting exceeds 2; extract a named decision or use an early return",
        );
      ts.forEachChild(node, (child) => visit(child, depth));
    };
    visit(source);
  }
}
if (violations.length) {
  console.error(violations.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    "Architecture policy: no authored class/this/catch; production conditional depth <= 2",
  );
