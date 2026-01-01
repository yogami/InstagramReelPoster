/**
 * ImpressumValidator - German legal requirements validation
 * 
 * Validates that business promo content includes required German legal information:
 * - Business name (Firmenname)
 * - Contact information (Kontaktdaten)
 * - Address (Anschrift)
 * - Legal form for commercial entities
 */

/**
 * Required Impressum fields for German business content
 */
export interface ImpressumRequirements {
    /** Business name must be present */
    businessName: boolean;
    /** Contact email or phone required */
    hasContact: boolean;
    /** Physical address required for commercial entities */
    hasAddress: boolean;
    /** Legal entity type (GmbH, UG, etc.) if applicable */
    legalForm?: string;
}

/**
 * Validation result for Impressum compliance
 */
export interface ImpressumValidationResult {
    valid: boolean;
    score: number;  // 0-100
    missing: string[];
    recommendations: string[];
}

/**
 * German legal form patterns
 */
const LEGAL_FORM_PATTERNS = [
    /\bGmbH\b/i,
    /\bUG\s*\(haftungsbeschränkt\)/i,
    /\bAG\b/,
    /\bKG\b/,
    /\bOHG\b/,
    /\be\.K\./i,
    /\bGbR\b/i,
    /\bEinzelunternehmen\b/i,
    /\bFreiberufler(in)?\b/i,
];

/**
 * Validates Impressum requirements for German business content
 */
export function validateImpressum(
    businessName?: string,
    contactEmail?: string,
    contactPhone?: string,
    address?: string,
    additionalInfo?: string
): ImpressumValidationResult {
    const missing: string[] = [];
    const recommendations: string[] = [];
    let score = 100;

    // Check business name
    if (!businessName || businessName.trim().length < 2) {
        missing.push('Firmenname (Business Name)');
        score -= 30;
    }

    // Check contact information
    const hasContact = !!(contactEmail || contactPhone);
    if (!hasContact) {
        missing.push('Kontaktdaten (Email oder Telefon)');
        score -= 25;
    } else if (!contactEmail) {
        recommendations.push('Email-Adresse empfohlen für vollständige Kontaktdaten');
        score -= 5;
    }

    // Check address
    if (!address || address.trim().length < 10) {
        missing.push('Anschrift (Physical Address)');
        score -= 25;
    }

    // Check for legal form in business name
    const fullText = `${businessName || ''} ${additionalInfo || ''}`;
    const hasLegalForm = LEGAL_FORM_PATTERNS.some(pattern => pattern.test(fullText));

    if (!hasLegalForm && businessName) {
        recommendations.push('Rechtsform angeben (z.B. GmbH, UG, e.K.) falls gewerblich');
        score -= 10;
    }

    // Ensure score doesn't go below 0
    score = Math.max(0, score);

    return {
        valid: missing.length === 0,
        score,
        missing,
        recommendations,
    };
}

/**
 * Extracts Impressum requirements from website analysis
 */
export function extractImpressumFromAnalysis(analysis: {
    detectedBusinessName?: string;
    email?: string;
    phone?: string;
    address?: string;
}): ImpressumRequirements {
    return {
        businessName: !!analysis.detectedBusinessName,
        hasContact: !!(analysis.email || analysis.phone),
        hasAddress: !!analysis.address,
    };
}

/**
 * Generates Impressum compliance warning text
 */
export function generateImpressumWarning(result: ImpressumValidationResult): string {
    if (result.valid) {
        return '';
    }

    const warnings: string[] = [];

    if (result.missing.length > 0) {
        warnings.push(`⚠️ Fehlende Pflichtangaben: ${result.missing.join(', ')}`);
    }

    if (result.recommendations.length > 0) {
        warnings.push(`💡 Empfehlungen: ${result.recommendations.join('; ')}`);
    }

    return warnings.join('\n');
}

/**
 * German Impressum legal disclaimer template
 */
export const IMPRESSUM_DISCLAIMER = `
Dieses Video wurde mit KI-Unterstützung erstellt.
Angaben gemäß § 5 TMG / § 18 MStV.
`;

/**
 * Checks if content targets German market based on language and location
 */
export function isGermanMarket(language: string, location?: string): boolean {
    const isGermanLanguage = language.toLowerCase() === 'de';
    const isGermanLocation = location?.toLowerCase().includes('berlin') ||
        location?.toLowerCase().includes('deutschland') ||
        location?.toLowerCase().includes('germany');

    return isGermanLanguage || !!isGermanLocation;
}
