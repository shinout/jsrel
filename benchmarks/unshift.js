function unshift(N) {
  var arr = [];
  for (var i=0; i<N; i++) {
    arr.unshift(i);
  }
  return arr;
}

function pushReverse(N) {
  var arr = [];
  for (var i=0; i<N; i++) {
    arr.push(i);
  }
  return arr.reverse();
}

function test(N) {
  var i;
  console.time("unshift");
  for (i=0; i<N; i++) unshift(1000)
  console.timeEnd("unshift");
  console.time("pushReverse");
  for (i=0; i<N; i++) pushReverse(1000)
  console.timeEnd("pushReverse");
}

test(1000)
