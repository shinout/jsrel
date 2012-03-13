var rtool = require('random-tools');
function order(N, M, L) {
  console.assert(N >= M, "N < M!!!!!");
  // creating array
  var arr = new Array(N);
  for (var i=0; i<N; i++) {
    arr[i] = i+1;
  }
  // pick up M elements
  var arr2 = rtool.combination(arr, M).sort(function(a, b) {
    return Math.random() - 0.5;
  });

  //  No.1 cap

  console.log("-------------------------------");
  console.log("N:", N, "M:", M, "Iteration:", L);
  // console.time("cap");
  // for (var c=0; c<L; c++) {
  //   var result1 = cap([arr, arr2]);
  // }
  // console.timeEnd("cap");

  console.time("hashFilter");
  for (var c=0; c<L; c++) {
    var result2 = hashFilter(arr, arr2);
  }
  console.timeEnd("hashFilter");

  console.time("sort");
  for (var c=0; c<L; c++) {
    var result3 = arr2.sort(function(a, b) {
      return a > b ? 1: -1;
    });
  }
  console.timeEnd("sort");
}

for (var N="10"; N!="100000"; N+= "0") {
  var n = Number(N);
  var nper2 = Math.floor(n/2);
  order(n, nper2, 1000);
  var nper3 = Math.floor(n/3);
  order(n, nper3, 1000);
  var nper30 = Math.floor(n*3 / 10);
  order(n, nper30, 1000);
  var nper4 = Math.floor(n/4);
  order(n, nper4, 1000);

  var nper5 = Math.floor(n/5);
  order(n, nper5, 1000);

  var nper6 = Math.floor(n/6);
  order(n, nper6, 1000);

  var nper7 = Math.floor(n/7);
  order(n, nper7, 1000);
}

function cap(arr) {
  if (!arr.length) return [];
  var current = ret = arr.shift(), target;
  var n = 0, len = arr.length;
  while(n < len) {
    ret = [], target = arr[n++];
    for(var i=0, l=current.length; i<l; i++) {
      for(var j=0, l2=target.length; j<l2; j++) {
        if (current[i] === target[j]) ret.push(current[i]);
      }
    }
    current = ret;
  }
  return unique(ret);
}

function unique(arr) {
  var ret = [];
  for(var i=0, l=arr.length; i<l; i++) {
    for(var j=i+1; j<l; j++) {
      if (arr[i] === arr[j]) j = ++i;
    }
    ret.push(arr[i]);
  }
  return ret;
};

function hashFilter(arrToItr, arrToHash) {
  var hash = {};
  for (var i=0, l=arrToHash.length; i<l; i++) hash[arrToHash[i]] = true;
  var ret = new Array(arrToHash.length);
  var k = 0;
  for (var j=0, l=arrToItr.length; j<l; j++) {
    var v = arrToItr[j];
    if (hash[v] != null) ret[k++] = v;
  }
  return ret;
}
