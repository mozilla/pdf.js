FROM node:current

WORKDIR /app

RUN apt-get update && apt-get install -y \
  build-essential \
  libcairo2-dev \
  libpango1.0-dev \
  libjpeg-dev \
  libgif-dev \
  librsvg2-dev \
  cmake \
  python3 \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g gulp-cli

EXPOSE 8888

CMD ["bash"]