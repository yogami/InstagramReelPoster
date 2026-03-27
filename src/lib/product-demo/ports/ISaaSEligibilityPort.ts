/**
 * SaaS Eligibility Port
 * 
 * Outbound interface for checking if a URL points to an eligible SaaS product.
 */

import { SaaSEligibilityResult } from '../domain/entities/ProductDemo';

export interface ISaaSEligibilityPort {
    /**
     * Checks if the given URL points to an eligible SaaS product.
     * 
     * @param url - The product URL to check
     * @returns Eligibility result with classification details
     */
    checkEligibility(url: string): Promise<SaaSEligibilityResult>;
}
