FROM --platform=linux/amd64 node:16

# Adds required libs to make puppeteer work properly in Debian
RUN apt-get update && \
    apt-get install -yq gconf-service libasound2 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 \
    libexpat1 libfontconfig1 libgcc1 libgconf-2-4 libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 libnspr4 \
    libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 \
    libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 \
    ca-certificates fonts-liberation libappindicator1 libgbm-dev libnss3 lsb-release xdg-utils wget unzip

# include noto for world languages https://fonts.google.com/noto
RUN apt-get install -yq fonts-noto
RUN mkdir -p /usr/local/share/fonts
# include emojis with Noto Emoji fonts, see: https://github.com/googlefonts/noto-emoji
RUN wget -O /usr/local/share/fonts/NotoColorEmoji.ttf https://github.com/googlefonts/noto-emoji/raw/main/fonts/NotoColorEmoji.ttf
RUN chmod 644 /usr/local/share/fonts/NotoColorEmoji.ttf

# RUN fc-cache -fv

# Start the app
WORKDIR /usr/src/app
COPY package*.json ./
ENV NODE_ENV=production
RUN npm install
COPY . .
CMD [ "node", "app.js" ]
