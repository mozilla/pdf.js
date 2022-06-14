FROM node
RUN mkdir -p /opt/node
COPY . /opt/node
WORKDIR /opt/node
RUN  npm install
#RUN  npm install --location=global gulp
#RUN npm install --location=global http-server
#RUN gulp generic
EXPOSE 8080
CMD ["npm","run","server"]