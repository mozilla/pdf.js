FROM node
RUN mkdir -p /opt/node
COPY . /opt/node
WORKDIR /opt/node
RUN apt-get update -y && apt-get upgrade -y && apt-get install unzip -y
RUN yarn install
EXPOSE 8888
CMD yarn run start