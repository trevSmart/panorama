import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const knipBin = join(dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', 'knip', 'bin', 'knip.js');

const ISSUE_FIELDS = [
  ['exports', 'Unused export', 'knip/unused-export'],
  ['types', 'Unused type', 'knip/unused-type'],
  ['enumMembers', 'Unused enum member', 'knip/unused-enum-member'],
  ['namespaceMembers', 'Unused namespace member', 'knip/unused-namespace-member'],
  ['dependencies', 'Unused dependency', 'knip/unused-dependency'],
  ['devDependencies', 'Unused devDependency', 'knip/unused-dev-dependency'],
  ['optionalPeerDependencies', 'Unused optional peer dependency', 'knip/unused-optional-peer-dependency'],
  ['unlisted', 'Unlisted dependency', 'knip/unlisted-dependency'],
  ['unresolved', 'Unresolved import', 'knip/unresolved-import'],
  ['binaries', 'Unused binary', 'knip/unused-binary'],
  ['catalog', 'Unused catalog dependency', 'knip/unused-catalog-dependency'],
];

function formatName(item) {
  if (typeof item === 'string') return item;
  if (item.namespace && item.name) return `${item.namespace}.${item.name}`;
  return item.name ?? String(item);
}

function collectDiagnostics(report) {
  const diagnostics = [];

  for (const issue of report.issues ?? []) {
    const file = issue.file;

    for (const [field, label, rule] of ISSUE_FIELDS) {
      for (const item of issue[field] ?? []) {
        diagnostics.push({
          file,
          line: item.line ?? 1,
          column: item.col ?? 1,
          message: `${label} "${formatName(item)}"`,
          rule,
        });
      }
    }

    for (const name of issue.duplicates ?? []) {
      diagnostics.push({
        file,
        line: 1,
        column: 1,
        message: `Duplicate export "${name}"`,
        rule: 'knip/duplicate-export',
      });
    }

    for (const unusedFile of issue.files ?? []) {
      const path = typeof unusedFile === 'string' ? unusedFile : unusedFile.name;
      diagnostics.push({
        file: path,
        line: 1,
        column: 1,
        message: 'Unused file',
        rule: 'knip/unused-file',
      });
    }
  }

  for (const file of report.files ?? []) {
    diagnostics.push({
      file,
      line: 1,
      column: 1,
      message: 'Unused file',
      rule: 'knip/unused-file',
    });
  }

  diagnostics.sort((a, b) => {
    if (a.file !== b.file) return a.file.localeCompare(b.file);
    if (a.line !== b.line) return a.line - b.line;
    if (a.column !== b.column) return a.column - b.column;
    return a.message.localeCompare(b.message);
  });

  return diagnostics;
}

function printEslintStylish(diagnostics) {
  let currentFile = '';

  for (const diagnostic of diagnostics) {
    if (diagnostic.file !== currentFile) {
      if (currentFile) console.log('');
      currentFile = diagnostic.file;
      console.log(currentFile);
    }

    console.log(
      `  ${diagnostic.line}:${diagnostic.column}  warning  ${diagnostic.message}  ${diagnostic.rule}`,
    );
  }

  if (currentFile) console.log('');
}

const result = spawnSync(process.execPath, [knipBin, '--reporter', 'json', ...process.argv.slice(2)], {
  encoding: 'utf8',
  maxBuffer: 10 * 1024 * 1024,
});

const stdout = result.stdout?.trim();
if (stdout) {
  try {
    const report = JSON.parse(stdout);
    const diagnostics = collectDiagnostics(report);

    if (diagnostics.length > 0) {
      printEslintStylish(diagnostics);
    }
  } catch (error) {
    console.error('Failed to parse Knip JSON output:', error.message);
    console.log(stdout);
  }
}

if (result.stderr) {
  process.stderr.write(result.stderr);
}

process.exit(result.status ?? 1);
