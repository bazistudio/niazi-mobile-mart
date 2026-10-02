
const fs = require('fs');
const path = 'frontend/src/lib/tauri/tauriClient.ts';
let content = fs.readFileSync(path, 'utf8');

const catalogIndex = content.indexOf('Catalog Domain');
if (catalogIndex === -1) {
    console.error('Could not find Catalog Domain marker');
    process.exit(1);
}

const splitIndex = content.lastIndexOf('\n', catalogIndex);
const beforeCatalog = content.substring(0, splitIndex);
let afterCatalog = content.substring(splitIndex);

// Regex updated for \r\n and any whitespace
const regex = /^\s*if \(isTauriEnvironment\(\)\) \{\s*const \{ invoke \} = await import\('@tauri-apps\/api\/core'\);\s*(?:return )?await invoke(?:<[^>]+>)?\('[^']+'(?:, \{(?:.|\r|\n)*?\})?\);\s*(?:return;\s*)?\}\r?\n/gm;

const initialLength = afterCatalog.length;
afterCatalog = afterCatalog.replace(regex, '');
console.log('Removed ' + (initialLength - afterCatalog.length) + ' characters.');

fs.writeFileSync(path, beforeCatalog + afterCatalog);

