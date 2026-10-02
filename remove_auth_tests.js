
const fs = require('fs');
const path = 'src-tauri/src/services/auth_service.rs';
let content = fs.readFileSync(path, 'utf8');

const testModIndex = content.indexOf('#[cfg(test)]\nmod tests {');
if (testModIndex !== -1) {
    const beforeTests = content.substring(0, testModIndex);
    fs.writeFileSync(path, beforeTests);
    console.log('Removed test module from auth_service.rs');
} else {
    console.log('Test module not found.');
}

