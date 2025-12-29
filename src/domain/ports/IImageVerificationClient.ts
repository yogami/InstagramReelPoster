/**
 * Result of image content verification.
 */
export interface ImageVerificationResult {
    /** Whether the image meets all expectations */
    isValid: boolean;
    /** Any text detected in the image */
    detectedText: string[];
    /** Description of any issues found */
    issues: string[];
    /** Raw analysis from the vision model */
    rawAnalysis?: string;
}

/**
 * Expectations for image verification.
 */
export interface ImageVerificationExpectations {
    /** Image must not contain any visible text */
    mustBeTextFree?: boolean;
    /** Specific elements that must be present */
    mustContain?: string[];
    /** Specific elements that must not be present */
    mustNotContain?: string[];
}

/**
 * Port for image content verification using vision LLM.
 */
export interface IImageVerificationClient {
    /**
     * Verifies image content against expectations.
     * @param imageUrl URL of the image to verify
     * @param expectations What the image should/shouldn't contain
     * @returns Verification result
     */
    verifyImageContent(
        imageUrl: string,
        expectations: ImageVerificationExpectations
    ): Promise<ImageVerificationResult>;
}
