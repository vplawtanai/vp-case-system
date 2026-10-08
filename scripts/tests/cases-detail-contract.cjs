/* eslint-disable @typescript-eslint/no-require-imports */
const ts = require('typescript');
const crypto = require('node:crypto');

// Pin the existing mutation queries, payload builders and audit calls while presentation changes.
function caseMutationEvidence(source, filename) {
  const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const printer = ts.createPrinter({ removeComments: true });
  const evidence = [];
  function keep(node, kind) { evidence.push({ kind, code: printer.printNode(ts.EmitHint.Unspecified, node, ast) }); }
  function visit(node) {
    if (ts.isAwaitExpression(node) && /supabase[\s\S]*?\.from\(/.test(node.expression.getText(ast))) keep(node, 'query');
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'createAuditLog') keep(node, 'audit');
    if (ts.isVariableDeclaration(node) && node.initializer && /payload/i.test(node.name.getText(ast))) keep(node.initializer, 'payload');
    if (ts.isVariableDeclaration(node) && node.initializer && /build.*Payload/.test(node.name.getText(ast))) keep(node.initializer, 'builder');
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return { count: evidence.length, sha256: crypto.createHash('sha256').update(JSON.stringify(evidence)).digest('hex') };
}
module.exports = { caseMutationEvidence };
