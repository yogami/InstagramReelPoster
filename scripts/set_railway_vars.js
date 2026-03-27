const { execSync } = require('child_process');
const fs = require('fs');

try {
    const varsRaw = fs.readFileSync('railway_vars.json', 'utf8');
    const vars = JSON.parse(varsRaw);
    
    // The new service ID from the deploy logs
    const newServiceId = '796b24b0-5884-49aa-96bf-4cf9d784af72';
    const envId = '4134f8b0-6ed7-4c4d-9f5f-9c476883267c';

    console.log("Setting variables for new service...");

    let args = [];
    for (const [key, value] of Object.entries(vars)) {
        if (!key.startsWith('RAILWAY_')) {
            // Escape double quotes and dollar signs
            const safeVal = value.replace(/"/g, '\\"').replace(/\$/g, '\\$');
            args.push(`${key}="${safeVal}"`);
        }
    }

    // Set them all at once
    const command = `railway variable set -s ${newServiceId} -e ${envId} --skip-deploys ${args.join(' ')}`;
    execSync(command, { stdio: 'inherit' });
    console.log("All variables set successfully.");

} catch (e) {
    console.error(e);
}
