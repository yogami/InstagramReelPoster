const { execSync } = require('child_process');

try {
    const listRaw = execSync('railway list --json', { encoding: 'utf-8' });
    const projects = JSON.parse(listRaw);
    
    console.log(`Found ${projects.length} projects. Searching variables...`);
    
    for (const project of projects) {
        const projId = project.id;
        const projName = project.name;
        
        try {
            execSync(`railway link -p ${projId}`, { stdio: 'ignore' });
        } catch(e) { continue; }
        
        const envs = project.environments?.edges || [];
        const services = project.services?.edges || [];

        for (const envEdge of envs) {
            const envId = envEdge.node.id;

            for (const svcEdge of services) {
                const svcId = svcEdge.node.id;
                const svcName = svcEdge.node.name;

                try {
                    const varsRaw = execSync(`railway variables --json -e ${envId} -s ${svcId}`, { encoding: 'utf-8', stdio: 'pipe' });
                    
                    if (varsRaw.includes('TELEGRAM_BOT_TOKEN') || varsRaw.includes('REPLICATE_API_TOKEN')) {
                        console.log(`\n✅ MATCH FOUND: Project ${projName} (${projId}) -> Service ${svcName} (${svcId})`);
                        console.log(varsRaw);
                        process.exit(0); // Stop when found
                    }
                    
                    const keys = Object.keys(JSON.parse(varsRaw));
                    if (keys.length > 0) {
                        console.log(`Project: ${projName} | Env: ${envEdge.node.name} | Service: ${svcName} | Keys: ${keys.slice(0, 5).join(', ')}`);
                    }
                } catch (err) {
                    // Ignore missing vars or permissions
                }
            }
        }
    }
} catch (e) {
    console.error(e);
}
