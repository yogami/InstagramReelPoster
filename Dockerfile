FROM node:20

# Install FFmpeg, Python3, pip, and basic tools
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies for WebOrganizer (SOTA classifier)
RUN pip3 install --no-cache-dir transformers torch --break-system-packages

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
