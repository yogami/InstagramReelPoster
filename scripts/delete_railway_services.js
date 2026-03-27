const https = require('https');
const { execSync } = require('child_process');
const fs = require('fs');

async function main() {
    // 1. Get Token from config
    const configRaw = fs.readFileSync('/Users/user1000/.railway/config.json', 'utf8');
    const config = JSON.parse(configRaw);
    const API_TOKEN = config.user.token;
    const PROJECT_ID = "68a2fd03-a7e2-4547-8216-fbeab327bc6f";

    function query(gql, variables = {}) {
        return new Promise((resolve, reject) => {
            const data = JSON.stringify({ query: gql, variables });
            const req = https.request('https://backboard.railway.app/graphql/v2', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${API_TOKEN}`,
                }
            }, (res) => {
                let body = '';
                res.on('data', c => body += c);
                res.on('end', () => resolve(JSON.parse(body)));
            });
            req.on('error', reject);
            req.write(data);
            req.end();
        });
    }

    // 2. Identify services using railway list
    const listRaw = execSync('railway list --json', { encoding: 'utf-8' });
    const projects = JSON.parse(listRaw);
    const cozyProject = projects.find(p => p.id === PROJECT_ID);
    const services = cozyProject.services.edges.map(e => e.node);

    console.log(`Found ${services.length} services to delete in cozy-vitality.`);
    
    // 3. Delete each service via GraphQL
    for (const svc of services) {
        console.log(`Deleting Service: ${svc.name} (${svc.id})...`);
        const res = await query(`mutation { serviceDelete(id: "${svc.id}") }`);
        console.log(res);
    }
    console.log("Deleted all old services.");
}

main().catch(console.error);
