# Optimized for Google Cloud Run / Antigravity Zero-Cost Hosting
FROM node:20-slim

# Install FFmpeg and basic system tools
RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

RUN npm install

# Install Playwright browsers (chromium only to save space)
RUN npx playwright install chromium
# Install Playwright OS dependencies
RUN npx playwright install-deps chromium

COPY . .

# Install Remotion puppet sub-project dependencies
RUN cd scripts/remotion-puppet && npm install

RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
