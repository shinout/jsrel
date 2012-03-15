function replace(v) {
  return '"' + v + '"';
}

var str = 'fasdeib"fa"fasd "table" is not defined "" is empty "" is not valid""""';

console.log(str.replace(/"/g, '\\"'));
console.log(str.split('"').join('\\"'));
console.assert(str.split('"').join('\\"') === str.replace(/"/g, '\\"'));
eval('var evalStr = "' + str.split('"').join('\\"') + '"');
console.log(evalStr);
console.assert(evalStr === str);

function test(N) {
  var i, v;
  console.time("replace");
  for (i=0; i<N; i++) {
    v = str.replace(/"/g, '\\"');
  }
  console.timeEnd("replace");
  console.time("splitJoin");
  for (i=0; i<N; i++) {
    v = str.split('"').join('\\"');
  }
  console.timeEnd("splitJoin");
}
test(100000)
