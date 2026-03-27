const { execSync } = require('child_process');

// Link the project first
execSync('railway link -p 68a2fd03-a7e2-4547-8216-fbeab327bc6f', { stdio: 'ignore' });

// Update OPENROUTER_MODEL to deepseek-r1:free — best free reasoning model on OpenRouter
const newModel = 'deepseek/deepseek-r1:free';
execSync(
    `railway variable set -s 796b24b0-5884-49aa-96bf-4cf9d784af72 -e 4134f8b0-6ed7-4c4d-9f5f-9c476883267c --skip-deploys OPENROUTER_MODEL="${newModel}"`,
    { stdio: 'inherit' }
);
console.log(`✅ OPENROUTER_MODEL updated to ${newModel}`);
