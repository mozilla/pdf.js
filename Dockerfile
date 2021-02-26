FROM node
RUN mkdir -p /opt/node
COPY . /opt/node
WORKDIR /opt/node
RUN npm i -g npm && npm install -g npm@7.6.0
RUN npm install
EXPOSE 8888
CMD npm run start

#FROM node:carbon
#WORKDIR /app
#
#COPY package*.json ./
#
#RUN npm install
#RUN npm install -g gulp-cli
#RUN npm install -g http-server
#
#COPY . .
#
#RUN gulp generic
#EXPOSE 8080
#CMD ["http-server", "build/generic"]