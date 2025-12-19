import * as fs from 'fs';
import * as path from 'path';

/**
 * Unit test to verify callback-on-success-only behavior.
 * This is a code inspection test to ensure the callback logic is correct.
 */
describe('Callback Only On Success', () => {
    const projectRoot = path.join(__dirname, '../../src');

    test('ReelOrchestrator should NOT call notifyCallback on failure path', () => {
        const filePath = path.join(projectRoot, 'application/ReelOrchestrator.ts');
        const content = fs.readFileSync(filePath, 'utf-8');

        // Find the catch block (error handling)
        const catchBlockMatch = content.match(/catch\s*\(\s*error\s*\)\s*\{[\s\S]*?throw error;[\s\S]*?\}/);

        if (!catchBlockMatch) {
            throw new Error('Could not find catch block in ReelOrchestrator');
        }

        const catchBlock = catchBlockMatch[0];

        // Verify notifyCallback is NOT called in the catch block
        expect(catchBlock).not.toContain('await this.notifyCallback');
    });

    test('ReelOrchestrator should call notifyCallback on success path', () => {
        const filePath = path.join(projectRoot, 'application/ReelOrchestrator.ts');
        const content = fs.readFileSync(filePath, 'utf-8');

        // Find the success path (before the catch block, after completedJob)
        const successPathMatch = content.match(/completedJob\.callbackUrl[\s\S]*?await this\.notifyCallback\(completedJob\)/);

        expect(successPathMatch).toBeTruthy();
    });

    test('notifyCallback should check for valid video URL before sending', () => {
        const filePath = path.join(projectRoot, 'application/ReelOrchestrator.ts');
        const content = fs.readFileSync(filePath, 'utf-8');

        // Verify the safeguard exists
        expect(content).toContain("job.status === 'completed' && !job.finalVideoUrl");
    });
});
