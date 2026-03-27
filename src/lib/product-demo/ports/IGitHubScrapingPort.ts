/**
 * GitHub Scraping Port
 * 
 * Outbound interface for parsing GitHub repositories.
 * Extracts README, docs, tech stack, and other context.
 */

import { GitHubContext } from '../domain/entities/ProductDemo';

export interface GitHubScrapingOptions {
    /** GitHub repository URL (e.g., https://github.com/owner/repo) */
    repoUrl: string;
    /** Whether to parse docs folder */
    parseDocs?: boolean;
    /** Whether to extract tech stack from package.json/requirements.txt/etc */
    extractTechStack?: boolean;
    /** Maximum number of doc files to parse */
    maxDocFiles?: number;
}

export interface IGitHubScrapingPort {
    /**
     * Parses a GitHub repository and returns structured context.
     * 
     * @param options - Scraping options
     * @returns GitHub context with README, tech stack, features
     */
    parseRepository(options: GitHubScrapingOptions): Promise<GitHubContext>;

    /**
     * Validates if a URL is a valid GitHub repository.
     * 
     * @param url - URL to validate
     * @returns True if valid GitHub repo URL
     */
    isValidGitHubUrl(url: string): boolean;
}
