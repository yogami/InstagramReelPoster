import path from 'path';
import fs from 'fs/promises';

/**
 * Fixture loader for TEST_MODE.
 * When TEST_MODE=true, clients load responses from fixture files.
 */
export class FixtureLoader {
    private static fixturesDir = path.join(__dirname, '../../tests/fixtures/responses');

    static async load(fixtureName: string): Promise<any> {
        const fixturePath = path.join(this.fixturesDir, fixtureName);
        const content = await fs.readFile(fixturePath, 'utf-8');

        // Handle both JSON and text files
        if (fixtureName.endsWith('.json')) {
            return JSON.parse(content);
        }
        return content;
    }

    static loadSync(fixtureName: string): any {
        const fixturePath = path.join(this.fixturesDir, fixtureName);
        const content = require('fs').readFileSync(fixturePath, 'utf-8');

        if (fixtureName.endsWith('.json')) {
            return JSON.parse(content);
        }
        return content;
    }
}
