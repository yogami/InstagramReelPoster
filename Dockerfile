FROM node:20

# Install FFmpeg and basic tools
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

RUN npm install

# Install Playwright browsers (chromium only to save space)
RUN npx playwright install chromium
# Install Playwright OS dependencies
RUN npx playwright install-deps chromium

COPY . .

RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
