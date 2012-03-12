var rtool = require('random-tools');
function aunique(arr) {
  var ret = [];
  for(var i=0, l=arr.length; i<l; i++) {
    for(var j=i+1; j<l; j++) {
      if (arr[i] === arr[j]) j = ++i;
    }
    ret.push(arr[i]);
  }
  return ret;
}

function ounique(arr) {                                                                                        
  var o = {};
  return arr.filter(function(i) { return i in o? false: o[i] = true});                                      
}                                                                                                           


function uniq(N, M, L) {
  var arr = new Array(N);
  for (var i=0; i<N; i++) {
    arr[i] = rtool.randomInt(M, 1);
  }
  console.log("-------------------------------");
  console.log("N:", N, "M:", M, "Iteration:", L);

  console.time("aunique");
  for (var c=0; c<L; c++) {
    var r = aunique(arr);
  }
  console.timeEnd("aunique");

  console.time("ounique");
  for (var d=0; d<L; d++) {
    var r2 = ounique(arr);
  }
  console.timeEnd("ounique");
}

uniq(10, 4, 1000)
uniq(100, 4, 1000)
uniq(1000, 4, 1000)

uniq(10, 8, 1000)
uniq(100, 80, 1000)
uniq(1000, 2, 1000)
uniq(1000, 300, 100)
uniq(1000, 800, 100)
uniq(1000, 1000, 100)
