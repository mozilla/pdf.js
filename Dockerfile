FROM node
RUN mkdir -p /opt/node
COPY . /opt/node
WORKDIR /opt/node
RUN  npm install -g gulp
RUN npm install -g http-server
#RUN gulp generic
EXPOSE 8080
CMD ["http-server", "build/generic"]