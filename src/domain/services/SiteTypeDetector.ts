import { SiteType, PersonalInfo } from '../entities/WebsitePromo';

/**
 * Site Type Detection Service
 * 
 * Determines whether a scraped website is a personal portfolio/site
 * or a business site based on content signals and patterns.
 */

export interface SiteTypeDetectionResult {
    siteType: SiteType;
    confidence: number;
    signals: string[];
}

/**
 * Detects site type from scraped content.
 * 
 * Personal site signals:
 * - First-person language ("I am", "My work", "I help")
 * - Individual name in title/hero (not plural, not "Team", not "We")
 * - Portfolio/resume sections
 * - Lack of business hours, physical location, pricing
 * - Skills list or about section
 * 
 * Business site signals:
 * - Plural/corporate language ("We help", "Our team", "Our services")
 * - Business hours, location, contact info
 * - Pricing pages, service packages
 * - Testimonials from customers/clients
 * 
 * @param heroText Main headline or H1 text
 * @param aboutContent Content from about page
 * @param keywords Extracted keywords
 * @param hasBusinessHours Whether business hours were found
 * @param hasPhysicalLocation Whether address/location was found
 * @param hasPricing Whether pricing information was found
 * @returns Detection result with confidence score
 */
export function detectSiteType(
    heroText: string,
    aboutContent: string = '',
    keywords: string[],
    hasBusinessHours: boolean,
    hasPhysicalLocation: boolean,
    hasPricing: boolean
): SiteTypeDetectionResult {
    const signals: string[] = [];
    let personalScore = 0;
    let businessScore = 0;

    // Normalize text for analysis
    const allText = `${heroText} ${aboutContent}`.toLowerCase();
    const normalizedKeywords = keywords.map(k => k.toLowerCase());

    // === PERSONAL SITE SIGNALS ===

    // First-person language (strong personal indicator)
    const firstPersonPatterns = [
        /\bi am\b/,
        /\bi'm\b/,
        /\bmy (work|portfolio|projects|skills|experience)\b/,
        /\bi help\b/,
        /\bi build\b/,
        /\bi design\b/,
        /\bi create\b/
    ];

    for (const pattern of firstPersonPatterns) {
        if (pattern.test(allText)) {
            personalScore += 2;
            signals.push('first-person language');
            break;
        }
    }

    // Portfolio/resume keywords
    const portfolioKeywords = ['portfolio', 'resume', 'cv', 'about me', 'my work', 'projects'];
    const hasPortfolioKeywords = portfolioKeywords.some(kw => normalizedKeywords.includes(kw) || allText.includes(kw));
    if (hasPortfolioKeywords) {
        personalScore += 1;
        signals.push('portfolio keywords');
    }

    // Individual name in title (format: "FirstName LastName - Title")
    const namePattern = /^([A-Z][a-z]+ [A-Z][a-z]+)\s*[-|]\s*.+/;
    if (namePattern.test(heroText)) {
        personalScore += 2;
        signals.push('individual name in title');
    }

    // Skills list presence
    const skillKeywords = ['skills', 'expertise', 'specialties', 'technologies'];
    const hasSkillsSection = skillKeywords.some(kw => normalizedKeywords.includes(kw) || allText.includes(kw));
    if (hasSkillsSection) {
        personalScore += 1;
        signals.push('skills section');
    }

    // === BUSINESS SITE SIGNALS ===

    // Corporate/plural language
    const corporatePatterns = [
        /\bwe (are|help|provide|offer|build|create)\b/,
        /\bour (team|services|clients|solutions|mission)\b/,
        /\bour company\b/,
        /\b(join|meet) our team\b/
    ];

    for (const pattern of corporatePatterns) {
        if (pattern.test(allText)) {
            businessScore += 2;
            signals.push('corporate language');
            break;
        }
    }

    // Business hours presence (strong business indicator)
    if (hasBusinessHours) {
        businessScore += 2;
        signals.push('business hours');
    }

    // Physical location/address (business indicator)
    if (hasPhysicalLocation) {
        businessScore += 1.5;
        signals.push('physical location');
    }

    // Pricing information (business indicator)
    if (hasPricing) {
        businessScore += 1.5;
        signals.push('pricing info');
    }

    // Testimonials/client references
    const testimonialKeywords = ['testimonials', 'reviews', 'clients', 'customers'];
    const hasTestimonials = testimonialKeywords.some(kw => normalizedKeywords.includes(kw));
    if (hasTestimonials) {
        businessScore += 1;
        signals.push('client testimonials');
    }

    // === DECISION LOGIC ===

    const totalScore = personalScore + businessScore;
    const confidence = totalScore > 0 ? Math.max(personalScore, businessScore) / totalScore : 0;

    // If scores are equal, default to business (safer for promo generation)
    const siteType: SiteType = personalScore > businessScore ? 'personal' : 'business';

    return {
        siteType,
        confidence: Math.min(confidence, 1.0),
        signals
    };
}

/**
 * Extracts personal information from scraped content.
 * Only call this if detectSiteType returns 'personal'.
 * 
 * @param heroText Main headline (format: "FirstName LastName - Title")
 * @param aboutContent Content from about page
 * @param keywords Extracted keywords
 * @returns PersonalInfo object with extracted data
 */
export function extractPersonalInfo(
    heroText: string,
    aboutContent: string = '',
    keywords: string[]
): PersonalInfo {
    // Extract name and title from hero text (format: "FirstName LastName - Title")
    const namePattern = /^([A-Z][a-zA-Z]+ [A-Z][a-zA-Z]+)\s*[-|]\s*(.+)$/;
    const match = heroText.match(namePattern);

    const fullName = match ? match[1].trim() : heroText.split('-')[0].trim();
    const title = match ? match[2].trim() : '';

    // Extract bio (first 200 chars from about content)
    const bio = aboutContent.length > 200
        ? aboutContent.substring(0, 200).trim() + '...'
        : aboutContent.trim();

    // Extract skills from keywords (filter out generic words)
    const genericWords = ['about', 'portfolio', 'contact', 'home', 'work', 'projects'];
    const skills = keywords
        .filter(kw => !genericWords.includes(kw.toLowerCase()))
        .filter(kw => kw.length > 2) // Remove very short words
        .slice(0, 5); // Maximum 5 skills

    return {
        fullName,
        title,
        bio: bio || undefined,
        skills
    };
}
