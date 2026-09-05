const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const srcDir = path.join(__dirname, 'src');

function getAllFiles(dir, ext = '.tsx', fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      getAllFiles(fullPath, ext, fileList);
    } else if (fullPath.endsWith(ext)) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

const tsxFiles = getAllFiles(srcDir, '.tsx');
const tsFiles = getAllFiles(srcDir, '.ts');
const allSourceFiles = [...tsxFiles, ...tsFiles];

const components = new Map();
const usages = new Map();
const hardcodedTailwind = [];

// Very basic parsing
for (const file of tsxFiles) {
  const content = fs.readFileSync(file, 'utf-8');
  const relPath = path.relative(__dirname, file).replace(/\\/g, '/');
  
  // Find component definitions (export function Component, const Component = )
  const componentRegex = /(?:export\s+)?(?:default\s+)?(?:function\s+([A-Z][a-zA-Z0-9_]*)|const\s+([A-Z][a-zA-Z0-9_]*)\s*=\s*(?:(?:\([^)]*\))|[^=]*)=>\s*(?:\{|\())/g;
  
  let match;
  while ((match = componentRegex.exec(content)) !== null) {
    const name = match[1] || match[2];
    if (name) {
      components.set(name, {
        path: relPath,
        name: name,
        category: getCategory(relPath),
        isReusable: relPath.includes('components/') || relPath.includes('ui/'),
      });
    }
  }
}

// Find usages
for (const file of allSourceFiles) {
  const content = fs.readFileSync(file, 'utf-8');
  for (const compName of components.keys()) {
    const usageRegex = new RegExp(`<${compName}[\\s>/]`, 'g');
    const matches = content.match(usageRegex);
    if (matches) {
      usages.set(compName, (usages.get(compName) || 0) + matches.length);
    }
  }
  
  // Find hardcoded styles
  const classMatch = content.match(/className=(?:\"([^"]+)\"|\'([^']+)\'|\{`([^`]+)`\})/g);
  if (classMatch) {
    classMatch.forEach(m => {
      if (m.includes('p-') || m.includes('m-') || m.includes('bg-[#') || m.includes('text-[#')) {
        hardcodedTailwind.push(file);
      }
    });
  }
}

function getCategory(filePath) {
    if (filePath.includes('/ui/')) return 'Atoms';
    if (filePath.includes('/components/')) return 'Molecules';
    if (filePath.includes('/features/')) return 'Organisms';
    if (filePath.includes('/app/') && filePath.includes('page.tsx')) return 'Pages';
    if (filePath.includes('/app/') && filePath.includes('layout.tsx')) return 'Templates';
    return 'Molecules';
}

// Generate Report
let report = `# TijaratPro Frontend Design System Audit & Component Inventory\n\n`;
report += `## Report 1 — Component Inventory\n\n`;
report += `| Component | File Path | Times Used | Category | Reusable? | Notes |\n`;
report += `|---|---|---|---|---|---|\n`;

let singleUse = 0;
let unused = 0;
let reusable = 0;
const categorized = { Atoms: [], Molecules: [], Organisms: [], Templates: [], Pages: [] };

for (const [name, data] of components.entries()) {
  const usedCount = usages.get(name) || 0;
  if (usedCount === 0) unused++;
  if (usedCount === 1) singleUse++;
  if (data.isReusable) reusable++;
  
  if (categorized[data.category]) {
      categorized[data.category].push(name);
  } else {
      categorized['Molecules'].push(name);
  }

  report += `| ${name} | ${data.path} | Used ${usedCount} times | ${data.category} | ${data.isReusable ? 'Reusable' : 'Single-use'} | |\n`;
}

report += `\n## Report 2 — Component Statistics\n\n`;
report += `- Total React Components: ${components.size}\n`;
report += `- Reusable Components: ${reusable}\n`;
report += `- Single-use Components: ${singleUse}\n`;
report += `- Unused Components: ${unused}\n`;
report += `- Components with hardcoded styling: ${new Set(hardcodedTailwind).size}\n`;

report += `\n## Report 3 — Atomic Design Classification\n\n`;
for (const [cat, items] of Object.entries(categorized)) {
    report += `### ${cat}\n`;
    report += items.map(i => `- ${i}`).join('\n') + '\n\n';
}

report += `\n## Final Metrics\n\n`;
report += `- Total Components: ${components.size}\n`;
report += `- Total Pages: ${categorized.Pages.length}\n`;
report += `- Total Layouts: ${categorized.Templates.length}\n`;
report += `- Total Atoms: ${categorized.Atoms.length}\n`;
report += `- Total Molecules: ${categorized.Molecules.length}\n`;
report += `- Total Organisms: ${categorized.Organisms.length}\n`;
report += `- Total Templates: ${categorized.Templates.length}\n`;
report += `- Reusable Components: ${reusable}\n`;

fs.writeFileSync('frontend_audit_report.md', report);
console.log('Done writing report to frontend_audit_report.md');
