FROM node
RUN mkdir -p /opt/node
COPY . /opt/node
RUN apt-get update -y && apt-get upgrade -y && apt-get install unzip -y && cd /opt/node && unzip pdf.js.zip && cd /opt/node/pdf.js
WORKDIR /opt/node/pdf.js
#RUN npm i -g npm && npm install -g npm@7.6.0
RUN  npm install -g gulp
#EXPOSE 8888
#CMD npm run start

#FROM node:carbon
#WORKDIR /app
#
#COPY package*.json ./
#
#RUN npm install
#RUN npm install -g gulp-cli
RUN npm install -g http-server
#
#COPY . .
#
RUN gulp generic
EXPOSE 8080
CMD ["http-server", "build/generic"]