console.time("read")
var db = require("jsrel").use(__dirname + "/kgxref", { schema: {
  ucsc:    {name : true, txt : false, $indexes: "name"},
  gene:    {name : true, ucsc : "ucsc", $indexes: "name" },
  refseq:  {name : true, ucsc : "ucsc", $indexes: "name" },
  uniprot: {name : true, gene: "gene", $indexes: "name"}
}});

var count = 0;
if (!db.one("ucsc", 1)) {

  require("linestream").tsv(__dirname + "/hg19_kgXref.txt", function(data) {
    var ucsc = data[0];
    var uniprot = data[2];
    var gene = data[4];
    var refseq = data[5];
    var txt = data[7];
    count++;
    db.ins("ucsc", {name: ucsc, txt: txt});
  })
  .on("end", function() {
    console.log("total", count);
    console.timeEnd("read")
    console.time("nocompress")
    var a = db.$export(true);
    console.timeEnd("nocompress")
    console.time("compress")
    var b = db.$export();
    console.timeEnd("compress")
    db.save()
  });
}
else {
  console.timeEnd("read")
  var N = 100;
  var exp = {}
  console.time("like")
  for (var i=0; i<N; i++) {
    exp = {}
    db.find("ucsc", {name : {like: "aa"}}, {select: "name", order: "name", explain: exp});
  }
  console.timeEnd("like")
  console.log(exp)

  console.time("like$")
  for (var i=0; i<N; i++) {
    exp = {}
    db.find("ucsc", {name : {like$: "uc001aa"}}, {select: "name", order: "name", explain: exp});
  }
  console.timeEnd("like$")
  console.log(exp)
}
