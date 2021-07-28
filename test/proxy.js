const http = require("http");

module.exports = function (req, res) {
  const { connection, host, ...originHeaders } = req.headers;
  // 构造请求报文
  const options = {
    method: req.method,
    hostname: "localhost",
    port: "3000",
    path: req.url,
    headers: { originHeaders },
  };
  // 通过req的data事件和end事件接收客户端发送的数据
  // 并用Buffer.concat处理一下
  const postbody = [];
  req.on("data", chunk => {
    postbody.push(chunk);
  });
  req.on("end", () => {
    const postbodyBuffer = Buffer.concat(postbody);
    // 定义变量接收目标服务器返回的数据
    const responsebody = [];
    // 发送请求头
    const request = http.request(options, response => {
      response.on("data", chunk => {
        responsebody.push(chunk);
      });
      response.on("end", () => {
        // 处理目标服务器数据,并将其返回给客户端
        const responsebodyBuffer = Buffer.concat(responsebody);
        res.end(responsebodyBuffer);
      });
    });
    // 将接收到的客户端请求数据发送到目标服务器;
    request.write(postbodyBuffer);
    request.end();
  });
};
