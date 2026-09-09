/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const ts = require("typescript"), React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { root } = require("./receipt-render-fixture.cjs");
const { UiLocaleProvider } = require(root + "/lib/i18n/provider.tsx");

function workspaceFixture(file, exportedNames = [], importOverrides = {}) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const ast = ts.createSourceFile(file, source, 99, true, ts.ScriptKind.TSX);
  const edits = [];
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isArrayBindingPattern(node.name) && node.initializer && ts.isCallExpression(node.initializer) && node.initializer.expression.getText(ast) === "useState") {
      let owner = "";
      for (let parent = node.parent; parent; parent = parent.parent) if (ts.isFunctionDeclaration(parent)) { owner = parent.name?.text || ""; break; }
      const binding = node.name.elements[0]?.name?.getText(ast);
      if (binding) edits.push([node.initializer.getStart(ast), node.initializer.end, `fixtureState("${owner}.${binding}", ${node.initializer.arguments[0]?.getText(ast) || "undefined"})`]);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  let declarations = source;
  for (const [start, end, value] of edits.sort((a, b) => b[0] - a[0])) declarations = declarations.slice(0, start) + value + declarations.slice(end);
  const rewritten = ts.createSourceFile(file, declarations, 99, true, ts.ScriptKind.TSX);
  declarations = rewritten.statements.filter(node => !ts.isImportDeclaration(node)).map(node => node.getText(rewritten)).join("\n");
  let state = {};
  const block = () => { throw Error("No network, navigation or mutation is allowed in this fixture"); };
  const context = { exports: {}, React, crypto: { randomUUID: () => "fixture-id" }, console, fixtureState: (key, initial) => [Object.hasOwn(state, key) ? state[key] : typeof initial === "function" ? initial() : initial, block] };
  for (const node of ast.statements.filter(ts.isImportDeclaration)) {
    if (!node.importClause || node.importClause.isTypeOnly) continue;
    const specifier = node.moduleSpecifier.text;
    let imported;
    if (Object.hasOwn(importOverrides, specifier)) imported = importOverrides[specifier];
    else if (specifier.endsWith("/supabase")) imported = { supabase: new Proxy({}, { get: block }) };
    else if (specifier.endsWith("/auditLog")) imported = { createAuditLog: block };
    else if (specifier.endsWith("/AuthGuard")) imported = { default: ({ children }) => children };
    else if (specifier.endsWith("/AppTopNav")) imported = { default: ({ title }) => React.createElement("h1", null, title) };
    else if (specifier === "next/link") imported = { default: ({ children, ...props }) => React.createElement("a", props, children) };
    else if (specifier === "next/navigation") imported = { useRouter: () => ({ push: block }), useSearchParams: () => new URLSearchParams(), useParams: () => ({ id: "fixture" }), usePathname: () => "/finance" };
    else imported = require(specifier.startsWith("@/") ? path.join(root, specifier.slice(2)) : specifier.startsWith(".") ? path.resolve(root, path.dirname(file), specifier) : specifier);
    if (node.importClause.name) context[node.importClause.name.text] = imported.default || imported;
    for (const binding of node.importClause.namedBindings?.elements || []) if (!binding.isTypeOnly) context[binding.name.text] = imported[binding.propertyName?.text || binding.name.text];
  }
  const output = ts.transpileModule(declarations + "\nexports.fixture = {" + exportedNames.join(",") + "};", { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: 9 } }).outputText;
  vm.runInNewContext(output, context, { filename: file });
  return {
    ...context.exports.fixture,
    component(name, overrides = {}) {
      return function FixtureComponent(props) {
        state = overrides;
        return React.createElement(context.exports.fixture[name] || context.exports.default, props);
      };
    },
    render(locale, overrides = {}, props = {}, componentName) {
      state = overrides;
      return renderToStaticMarkup(React.createElement(UiLocaleProvider, { initialLocale: locale, pathname: "/finance", coverage: { finance: true, documentSettings: true, other: false } }, React.createElement(componentName ? context.exports.fixture[componentName] : context.exports.default, props)));
    },
  };
}
module.exports = { workspaceFixture };
