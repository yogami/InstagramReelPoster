/**
 * Content DNA Analyzer Tests
 * 
 * TDD tests for extracting pain points, trust signals, and urgency from websites.
 * Part of Phase 1: Scraping Intelligence enhancements.
 */

import { ContentDNAAnalyzer, SiteDNA } from '../../../src/slices/website-promo/domain/services/ContentDNAAnalyzer';
import { WebsiteAnalysis } from '../../../src/slices/website-promo/domain/entities/WebsitePromo';

describe('ContentDNAAnalyzer', () => {
    let analyzer: ContentDNAAnalyzer;

    beforeEach(() => {
        analyzer = new ContentDNAAnalyzer();
    });

    describe('analyzeDNA', () => {
        it('should detect high pain score from problem-focused content', () => {
            // Given: A website with strong problem/pain language
            const analysis: Partial<WebsiteAnalysis> = {
                heroText: 'Tired of waiting weeks for video content?',
                metaDescription: 'Stop struggling with expensive video production. We solve your marketing pain.',
                aboutContent: 'We understand the frustration of slow turnaround times and budget overruns.',
                keywords: ['video', 'marketing', 'fast', 'affordable'],
                sourceUrl: 'https://example.com'
            };

            // When: Analyzing for DNA
            const dna = analyzer.analyzeDNA(analysis as WebsiteAnalysis);

            // Then: High pain score detected
            expect(dna.painScore).toBeGreaterThanOrEqual(6);
            expect(dna.confidence).toBeGreaterThan(0.5);
        });

        it('should extract trust signals from testimonials and social proof', () => {
            // Given: A website with strong trust indicators
            const analysis: Partial<WebsiteAnalysis> = {
                heroText: 'Trusted by 500+ businesses worldwide',
                metaDescription: 'Award-winning video production with 4.9★ on Google Reviews',
                aboutContent: 'Featured in Forbes, TechCrunch, and Wired. ISO 27001 certified.',
                keywords: ['trusted', 'certified', 'award'],
                sourceUrl: 'https://example.com'
            };

            // When: Analyzing for DNA
            const dna = analyzer.analyzeDNA(analysis as WebsiteAnalysis);

            // Then: Trust signals extracted
            expect(dna.trustSignals.length).toBeGreaterThanOrEqual(2);
            expect(dna.trustSignals.some(s => s.includes('500+') || s.includes('4.9'))).toBe(true);
        });

        it('should detect urgency triggers from time-limited offers', () => {
            // Given: A website with urgency language
            const analysis: Partial<WebsiteAnalysis> = {
                heroText: 'Limited spots available - Book your free demo today!',
                metaDescription: 'Only 3 slots left this month. Act now.',
                aboutContent: 'Our exclusive offer ends Friday.',
                keywords: ['limited', 'exclusive', 'hurry'],
                sourceUrl: 'https://example.com'
            };

            // When: Analyzing for DNA
            const dna = analyzer.analyzeDNA(analysis as WebsiteAnalysis);

            // Then: Urgency detected
            expect(dna.urgency).not.toBeNull();
            expect(dna.urgency).toMatch(/limited|book|ends|act now/i);
        });

        it('should return low scores for generic content without strong signals', () => {
            // Given: A bland website with no strong signals
            const analysis: Partial<WebsiteAnalysis> = {
                heroText: 'Welcome to our website',
                metaDescription: 'We provide services.',
                aboutContent: 'We are a company.',
                keywords: ['company', 'services'],
                sourceUrl: 'https://example.com'
            };

            // When: Analyzing for DNA
            const dna = analyzer.analyzeDNA(analysis as WebsiteAnalysis);

            // Then: Low scores across the board
            expect(dna.painScore).toBeLessThanOrEqual(3);
            expect(dna.trustSignals.length).toBeLessThanOrEqual(1);
            expect(dna.urgency).toBeNull();
        });

        it('should handle missing fields gracefully', () => {
            // Given: Minimal analysis data
            const analysis: Partial<WebsiteAnalysis> = {
                heroText: '',
                keywords: [],
                sourceUrl: 'https://example.com'
            };

            // When: Analyzing for DNA
            const dna = analyzer.analyzeDNA(analysis as WebsiteAnalysis);

            // Then: Returns valid structure with low confidence
            expect(dna).toHaveProperty('painScore');
            expect(dna).toHaveProperty('trustSignals');
            expect(dna).toHaveProperty('urgency');
            expect(dna).toHaveProperty('confidence');
            expect(dna.confidence).toBeLessThan(0.5);
        });
    });
});
