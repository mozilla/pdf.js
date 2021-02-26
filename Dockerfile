FROM node
RUN mkdir -p /opt/node
COPY . /opt/node
#RUN apt-get update -y && apt-get upgrade -y && apt-get install unzip -y && cd /opt/node && unzip pdf.js.zip && cd /opt/node/pdf.js
WORKDIR /opt/node/pdf.js
RUN npm install -g gulp
RUN npm install
RUN npm install -g http-server
RUN gulp generic
EXPOSE 8080
CMD ["http-server", "build/generic"]