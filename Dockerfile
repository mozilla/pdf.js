FROM node
RUN mkdir -p /opt/node
COPY . /opt/node
WORKDIR /opt/node
RUN npm install
EXPOSE 8888
CMD npm run start