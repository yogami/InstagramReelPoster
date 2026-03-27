/**
 * GitHub Scraper Adapter
 * 
 * Parses GitHub repositories for additional product context.
 * Extracts README, docs, tech stack, and features.
 */

import { IGitHubScrapingPort, GitHubScrapingOptions } from '../ports/IGitHubScrapingPort';
import { GitHubContext } from '../domain/entities/ProductDemo';

export interface GitHubScraperDeps {
    /** HTTP client for GitHub API */
    httpClient: {
        get<T>(url: string, options?: { headers?: Record<string, string> }): Promise<T>;
    };
    /** GitHub API token (optional, increases rate limits) */
    githubToken?: string;
}

interface GitHubRepoResponse {
    name: string;
    description: string | null;
    topics: string[];
    stargazers_count: number;
    license: { spdx_id: string } | null;
    default_branch: string;
}

interface GitHubContentResponse {
    content: string;
    encoding: string;
}

export class GitHubScraperAdapter implements IGitHubScrapingPort {
    private readonly apiBase = 'https://api.github.com';

    constructor(private readonly deps: GitHubScraperDeps) { }

    isValidGitHubUrl(url: string): boolean {
        try {
            const parsed = new URL(url);
            return parsed.hostname === 'github.com' && parsed.pathname.split('/').filter(Boolean).length >= 2;
        } catch {
            return false;
        }
    }

    async parseRepository(options: GitHubScrapingOptions): Promise<GitHubContext> {
        if (!this.isValidGitHubUrl(options.repoUrl)) {
            throw new Error('Invalid GitHub URL');
        }

        const { owner, repo } = this.parseGitHubUrl(options.repoUrl);
        console.log(`[GitHubScraper] Parsing repository: ${owner}/${repo}`);

        // Fetch repo metadata
        const repoData = await this.fetchJson<GitHubRepoResponse>(
            `${this.apiBase}/repos/${owner}/${repo}`
        );

        // Fetch README
        let readmeContent: string | undefined;
        try {
            const readmeData = await this.fetchJson<GitHubContentResponse>(
                `${this.apiBase}/repos/${owner}/${repo}/readme`
            );
            readmeContent = this.decodeContent(readmeData.content, readmeData.encoding);
        } catch {
            console.warn('[GitHubScraper] No README found');
        }

        // Extract tech stack
        let techStack: string[] = [];
        if (options.extractTechStack !== false) {
            techStack = await this.extractTechStack(owner, repo);
        }

        // Parse docs if requested
        let features: string[] = [];
        let architectureNotes: string | undefined;
        if (options.parseDocs) {
            const docsResult = await this.parseDocsFolder(owner, repo, options.maxDocFiles || 5);
            features = docsResult.features;
            architectureNotes = docsResult.architectureNotes;
        }

        // Extract features from README if not found in docs
        if (features.length === 0 && readmeContent) {
            features = this.extractFeaturesFromReadme(readmeContent);
        }

        return {
            repoUrl: options.repoUrl,
            repoName: repoData.name,
            readmeContent,
            description: repoData.description || undefined,
            topics: repoData.topics,
            techStack,
            features,
            architectureNotes,
            stars: repoData.stargazers_count,
            license: repoData.license?.spdx_id
        };
    }

    private parseGitHubUrl(url: string): { owner: string; repo: string } {
        const parsed = new URL(url);
        const parts = parsed.pathname.split('/').filter(Boolean);
        return { owner: parts[0], repo: parts[1].replace('.git', '') };
    }

    private async fetchJson<T>(url: string): Promise<T> {
        const headers: Record<string, string> = {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'ProductDemoSlice/1.0'
        };

        if (this.deps.githubToken) {
            headers['Authorization'] = `Bearer ${this.deps.githubToken}`;
        }

        return this.deps.httpClient.get<T>(url, { headers });
    }

    private decodeContent(content: string, encoding: string): string {
        if (encoding === 'base64') {
            return Buffer.from(content, 'base64').toString('utf-8');
        }
        return content;
    }

    private async extractTechStack(owner: string, repo: string): Promise<string[]> {
        const techStack: string[] = [];

        // Try package.json
        try {
            const packageJson = await this.fetchJson<GitHubContentResponse>(
                `${this.apiBase}/repos/${owner}/${repo}/contents/package.json`
            );
            const content = JSON.parse(this.decodeContent(packageJson.content, packageJson.encoding));

            const deps = {
                ...content.dependencies,
                ...content.devDependencies
            };

            // Extract key frameworks/libraries
            const keyTech = ['react', 'vue', 'angular', 'next', 'express', 'fastify', 'nest', 'prisma', 'typescript'];
            for (const tech of keyTech) {
                if (Object.keys(deps).some(d => d.toLowerCase().includes(tech))) {
                    techStack.push(tech);
                }
            }
        } catch {
            // Try requirements.txt for Python
            try {
                const requirements = await this.fetchJson<GitHubContentResponse>(
                    `${this.apiBase}/repos/${owner}/${repo}/contents/requirements.txt`
                );
                const content = this.decodeContent(requirements.content, requirements.encoding);
                const lines = content.split('\n').slice(0, 10);
                techStack.push('python');
                lines.forEach(line => {
                    const pkg = line.split('==')[0].split('>=')[0].trim();
                    if (pkg && !pkg.startsWith('#')) {
                        techStack.push(pkg);
                    }
                });
            } catch {
                // No recognized package manager
            }
        }

        return [...new Set(techStack)].slice(0, 10);
    }

    private async parseDocsFolder(owner: string, repo: string, maxFiles: number): Promise<{ features: string[]; architectureNotes?: string }> {
        const features: string[] = [];
        let architectureNotes: string | undefined;

        try {
            const docsContents = await this.fetchJson<Array<{ name: string; path: string; type: string }>>(
                `${this.apiBase}/repos/${owner}/${repo}/contents/docs`
            );

            const mdFiles = docsContents
                .filter(f => f.type === 'file' && f.name.endsWith('.md'))
                .slice(0, maxFiles);

            for (const file of mdFiles) {
                const fileContent = await this.fetchJson<GitHubContentResponse>(
                    `${this.apiBase}/repos/${owner}/${repo}/contents/${file.path}`
                );
                const content = this.decodeContent(fileContent.content, fileContent.encoding);

                // Look for architecture docs
                if (file.name.toLowerCase().includes('architect')) {
                    architectureNotes = content.slice(0, 1000);
                }

                // Extract features from doc files
                features.push(...this.extractFeaturesFromReadme(content));
            }
        } catch {
            // No docs folder
        }

        return { features: [...new Set(features)].slice(0, 10), architectureNotes };
    }

    private extractFeaturesFromReadme(content: string): string[] {
        const features: string[] = [];
        const lines = content.split('\n');

        let inFeatureSection = false;
        for (const line of lines) {
            const lower = line.toLowerCase();

            if (lower.includes('## feature') || lower.includes('## key feature') || lower.includes('## what')) {
                inFeatureSection = true;
                continue;
            }

            if (inFeatureSection && line.startsWith('##')) {
                inFeatureSection = false;
            }

            if (inFeatureSection && (line.startsWith('- ') || line.startsWith('* '))) {
                const feature = line.replace(/^[-*]\s*\*?\*?/, '').trim();
                if (feature.length > 5 && feature.length < 100) {
                    features.push(feature);
                }
            }
        }

        return features.slice(0, 8);
    }
}
