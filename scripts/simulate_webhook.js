const fs = require('fs');
const { execSync } = require('child_process');

try {
    const varsRaw = fs.readFileSync('railway_vars.json', 'utf8');
    const vars = JSON.parse(varsRaw);
    
    const webhookUrl = `https://cozy-vitality-production-3d68.up.railway.app/telegram-webhook`;
    const secret = vars.TELEGRAM_WEBHOOK_SECRET;

    console.log(`Sending simulated Telegram webhook to: ${webhookUrl}`);

    const payload = {
        update_id: Date.now(),
        message: {
            message_id: 1234,
            chat: {
                id: 111222333, // dummy chat ID
                type: "private"
            },
            text: `/reel use this exact phrasing: When you revert to the natural state of your body, you tap into a profound intelligence that the spiritual traditions call divine. Call it whatever you may. In this state, there exists a peace that is not manufactured. A stillness that is not practiced. From this stillness, something remarkable happens — you begin to see clearly. You see the sexual power games embedded in culture. You see how much of your own desire has been shaped, distorted, and weaponised by conditioning. You see how people use sexuality to manipulate, to control, to avoid themselves. And more crucially, you see your own bullshit too. This clarity is not a moral stance. It is not prudishness. It is vision. And from this vision, you stop participating in the drama — both as victim and as perpetrator. But here is the uncomfortable truth: nobody wants to arrive at this state. Because they are too attached to the pleasure that the game provides. So when you no longer play, they will name you. Asexual. Religious. Prude. Conservative. Any label will do, as long as it protects them from looking at themselves. The label is not about you. It never was.`
        }
    };

    const curlCmd = `curl -X POST ${webhookUrl} \\
    -H "Content-Type: application/json" \\
    -H "x-telegram-bot-api-secret-token: ${secret}" \\
    -d '${JSON.stringify(payload)}'`;

    console.log("Executing cURL command...");
    const out = execSync(curlCmd, { encoding: 'utf-8' });
    console.log("Response:", out);

} catch (e) {
    console.error(e);
}
