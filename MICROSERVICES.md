# Internal Microservice Catalog

This directory lists re-usable microservices and bounded contexts extracted from our projects.
Always check this catalog before building new features to maximize reuse.

## Available Services

### 1. Promo Engine
- **Source**: `InstagramReelPoster`
- **Location**: `src/lib/promo-engine`
- **Description**: Domain service for managing persona training, dataset preparation, and promo generation (video/image).
- **Key Use Cases**: 
  - `PrepareDatasetUseCase`: Extract frames from video reels.
  - `TrainPersonaUseCase`: Fine-tune Flux/Stable Diffusion models on Replicate.
  - `GeneratePromoUseCase`: Generate promotional content using trained personas.
- **Status**: Stable (v1 extracted)

### 2. Website Promo
- **Source**: `InstagramReelPoster`
- **Location**: `src/lib/website-promo`
- **Description**: Domain service for generating promotional reels from a website URL.
- **Key Use Cases**: 
  - `WebsitePromoUseCase`: Orchestrates the full flow from scraping to rendering.
  - `BlueprintFactory`: Generates a storyboard based on website analysis.
  - `ContentDNAAnalyzer`: Analyzes website content for business classification.
- **Status**: Stable (v1 extracted)

### 3. Geo-Regulatory Discovery Service
- **Source**: `Micro-Catchment-Retrofit-Planner`
- **Location**: `src/lib/geo-regulatory`
- **Description**: Hierarchical regulatory discovery service based on geolocation.
- **Status**: Stable
