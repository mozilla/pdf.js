const WebServer = require("./webserver.js").WebServer;
const server = new WebServer();
server.port = 8888;
server.start();
