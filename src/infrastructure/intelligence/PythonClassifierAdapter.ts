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
    private timeoutMs: number;

    constructor(timeoutMs: number = 30000) { // 30 second timeout for CPU inference
        this.scriptPath = path.join(process.cwd(), 'src/infrastructure/intelligence/web_organizer.py');
        this.timeoutMs = timeoutMs;
    }

    async classify(mainText: string, metadata: any = {}): Promise<WebOrganizerResult> {
        return new Promise((resolve, reject) => {
            const pythonProcess = spawn('python3', [this.scriptPath]);
            let output = '';
            let errorOutput = '';
            let timedOut = false;

            // Timeout protection - CPU inference can take forever
            const timeoutId = setTimeout(() => {
                timedOut = true;
                pythonProcess.kill('SIGTERM');
                console.warn(`[WebOrganizer] Timeout after ${this.timeoutMs / 1000}s - falling back to heuristics`);
                resolve({
                    topic: 'Unknown',
                    format: 'Unknown',
                    confidence: 0,
                    error: `Timeout after ${this.timeoutMs / 1000}s (CPU inference too slow)`
                });
            }, this.timeoutMs);

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
                clearTimeout(timeoutId);
                if (timedOut) return; // Already resolved

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
                clearTimeout(timeoutId);
                if (timedOut) return; // Already resolved

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
