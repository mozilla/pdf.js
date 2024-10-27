FROM node:18

RUN useradd -r -m -d /app app
WORKDIR /app
COPY --chown=app:app ./ ./

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    cmake \
    python3 \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g gulp-cli

RUN npm install

USER app

EXPOSE 8888
CMD ["gulp", "server"]