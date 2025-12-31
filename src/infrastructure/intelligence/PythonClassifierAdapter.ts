import { spawn } from 'child_process';
import path from 'path';

export interface WebOrganizerResult {
    topic: string;
    format: string;
    confidence: number;
    error?: string;
}

export class PythonClassifierAdapter {
    private scriptPath: string;

    constructor() {
        this.scriptPath = path.join(process.cwd(), 'src/infrastructure/intelligence/web_organizer.py');
    }

    async classify(mainText: string, metadata: any = {}): Promise<WebOrganizerResult> {
        return new Promise((resolve, reject) => {
            const pythonProcess = spawn('python3', [this.scriptPath]);

            let output = '';
            let errorOutput = '';

            // Send input data
            const inputData = JSON.stringify({
                main_text: mainText,
                ...metadata
            });
            pythonProcess.stdin.write(inputData);
            pythonProcess.stdin.end();

            pythonProcess.stdout.on('data', (data) => {
                output += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                errorOutput += data.toString();
                // Log stderr but don't fail immediately as it might be logging
                console.log(`[WebOrganizer] ${data.toString()}`);
            });

            pythonProcess.on('close', (code) => {
                if (code !== 0) {
                    console.error(`[WebOrganizer] Process exited with code ${code}`);
                    // Fallback or reject? Let's resolve with error to handle gracefully
                    resolve({
                        topic: 'Unknown',
                        format: 'Unknown',
                        confidence: 0,
                        error: `Process exited with code ${code}: ${errorOutput}`
                    });
                    return;
                }

                try {
                    const result = JSON.parse(output);
                    resolve(result);
                } catch (e) {
                    resolve({
                        topic: 'Unknown',
                        format: 'Unknown',
                        confidence: 0,
                        error: `Failed to parse JSON: ${e}`
                    });
                }
            });

            pythonProcess.on('error', (err) => {
                resolve({
                    topic: 'Unknown',
                    format: 'Unknown',
                    confidence: 0,
                    error: `Spawn error: ${err.message}`
                });
            });
        });
    }
}
