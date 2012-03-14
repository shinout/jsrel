function assert2(torf) { return torf }

function err() {
  var args = Array.prototype.slice.call(arguments);
  args.unshift('[JSRel.js]');
  var err = args.join(" ");
  if (!err) err = "(undocumented error)";
  throw new Error(err);
}

function quo(v) { return '"'+ v + '"'}

function assert1() {
  var args = Array.prototype.slice.call(arguments);
  var torf = args.shift();
  if (torf) return;
  args.unshift('[JSRel.js]');
  var err = args.join(" ");
  if (!err) err = "(undocumented error)";
  throw new Error(err);
}

function test(N) {
  var i;
  console.time("assert1");
  for (i=0; i<N; i++) {
    assert1(i < N, quo(i), "is larger or equal to", quo(N));
  }
  console.timeEnd("assert1");
  console.time("assert2");
  for (i=0; i<N; i++) {
    assert2(i < N) || err(quo(i), "is larger or equal to", quo(N));
  }
  console.timeEnd("assert2");
  console.time("assert3");
  for (i=0; i<N; i++) {
    (i < N) || err(quo(i), "is larger or equal to", quo(N));
  }
  console.timeEnd("assert3");
}
test(100000)
