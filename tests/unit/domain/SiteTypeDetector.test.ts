import { detectSiteType, extractPersonalInfo } from '../../../src/domain/services/SiteTypeDetector';

describe('SiteTypeDetector', () => {
    describe('detectSiteType', () => {
        it('should detect personal site from first-person language', () => {
            const result = detectSiteType(
                'John Doe - Software Engineer',
                'I am a software engineer with 10 years of experience. I help companies build scalable systems.',
                ['portfolio', 'projects', 'skills'],
                false,
                false,
                false
            );

            expect(result.siteType).toBe('personal');
            expect(result.confidence).toBeGreaterThan(0.5);
            expect(result.signals).toContain('first-person language');
        });

        it('should detect personal site from individual name pattern', () => {
            const result = detectSiteType(
                'Didi Berman - AI Automation Engineer | MLOps & DevOps Specialist',
                '',
                ['ai', 'automation', 'mlops'],
                false,
                false,
                false
            );

            expect(result.siteType).toBe('personal');
            expect(result.signals).toContain('individual name in title');
        });

        it('should detect business site from corporate language', () => {
            const result = detectSiteType(
                'TechCorp - Leading Software Solutions',
                'We are a team of experts who help businesses transform digitally. Our services include...',
                ['services', 'team', 'clients'],
                true,
                true,
                true
            );

            expect(result.siteType).toBe('business');
            expect(result.confidence).toBeGreaterThan(0.6);
            expect(result.signals).toContain('corporate language');
        });

        it('should detect business site from business hours and location', () => {
            const result = detectSiteType(
                'Cafe Berlin - Fresh Coffee Daily',
                'Visit us for the best coffee in town.',
                ['coffee', 'cafe', 'menu'],
                true, // has business hours
                true, // has location
                false
            );

            expect(result.siteType).toBe('business');
            expect(result.signals).toContain('business hours');
            expect(result.signals).toContain('physical location');
        });

        it('should default to business when signals are ambiguous', () => {
            const result = detectSiteType(
                'Generic Website',
                'Some content here.',
                ['web', 'site'],
                false,
                false,
                false
            );

            expect(result.siteType).toBe('business');
            expect(result.confidence).toBeLessThan(0.5);
        });

        it('should detect personal site from portfolio keywords', () => {
            const result = detectSiteType(
                'Designer Portfolio',
                'My work includes branding, UI/UX, and illustration.',
                ['portfolio', 'my work', 'projects'],
                false,
                false,
                false
            );

            expect(result.siteType).toBe('personal');
            expect(result.signals).toContain('portfolio keywords');
        });
    });

    describe('extractPersonalInfo', () => {
        it('should extract name and title from hero text', () => {
            const info = extractPersonalInfo(
                'Didi Berman - AI Automation Engineer',
                'Experienced in MLOps and DevOps with a focus on scalable systems.',
                ['ai', 'mlops', 'devops', 'automation']
            );

            expect(info.fullName).toBe('Didi Berman');
            expect(info.title).toBe('AI Automation Engineer');
            expect(info.bio).toContain('MLOps');
            expect(info.skills).toEqual(['mlops', 'devops', 'automation']);
        });

        it('should handle alternative delimiter (pipe)', () => {
            const info = extractPersonalInfo(
                'Jane Smith | Product Designer',
                '',
                ['design', 'ui', 'ux']
            );

            expect(info.fullName).toBe('Jane Smith');
            expect(info.title).toBe('Product Designer');
        });

        it('should limit skills to 5 items', () => {
            const info = extractPersonalInfo(
                'John Doe - Developer',
                '',
                ['react', 'node', 'typescript', 'python', 'go', 'rust', 'java']
            );

            expect(info.skills.length).toBeLessThanOrEqual(5);
        });

        it('should filter out generic keywords', () => {
            const info = extractPersonalInfo(
                'Alice Johnson - Writer',
                '',
                ['portfolio', 'about', 'contact', 'writing', 'storytelling', 'articles']
            );

            expect(info.skills).not.toContain('portfolio');
            expect(info.skills).not.toContain('about');
            expect(info.skills).not.toContain('contact');
            expect(info.skills).toContain('writing');
        });

        it('should truncate bio to 200 characters', () => {
            const longBio = 'A'.repeat(300);
            const info = extractPersonalInfo(
                'Bob Brown - Consultant',
                longBio,
                []
            );

            expect(info.bio!.length).toBeLessThanOrEqual(203); // 200 + "..."
            expect(info.bio).toContain('...');
        });
    });
});
