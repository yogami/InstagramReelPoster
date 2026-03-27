const { execSync } = require('child_process');
const fs = require('fs');

try {
    const projId = '68a2fd03-a7e2-4547-8216-fbeab327bc6f';
    const envId = '4134f8b0-6ed7-4c4d-9f5f-9c476883267c';
    const svcId = 'd7a91f2f-e2ab-4ca5-bbc4-6bfc5a54c2ae';

    console.log(`Extracting variables from Project ${projId}, Env ${envId}, Service ${svcId}...`);
    
    // Link the project first
    execSync(`railway link -p ${projId}`);
    
    // Then get variables
    const varsRaw = execSync(`railway variables --json -e ${envId} -s ${svcId}`, { encoding: 'utf-8', stdio: 'pipe' });
    
    // Save as JSON
    fs.writeFileSync('railway_vars.json', varsRaw);
    console.log("Variables successfully written to railway_vars.json");
    
    // Also save as .env.railway format
    const varsMap = JSON.parse(varsRaw);
    let envContent = '';
    for (const [k, v] of Object.entries(varsMap)) {
        // Exclude Railway specific internals unless needed
        if (!k.startsWith('RAILWAY_')) {
            envContent += `${k}="${v.replace(/"/g, '\\"')}"\n`;
        }
    }
    fs.writeFileSync('.env.railway', envContent);
    console.log("Variables successfully written to .env.railway");
} catch (e) {
    console.error(e);
}
