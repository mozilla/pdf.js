const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

const counts = {};

rl.on('line', function(line){
  let ending = line.split(".").pop();
  let added = parseInt(line.split("\t")[0]);
  if(!counts[ending]) counts[ending] = 0;
  counts[ending] += added;
})

process.on('exit', function () {
  counts["SUM"] = Object.values(counts).reduce((n, e) => n + e, 0);
  console.log(counts);
});