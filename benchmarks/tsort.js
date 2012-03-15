  function tsort(edges) {
    var nodes = {}, sorted = [], visited = {}, Node = function(id) { this.id = id, this.afters = [] };
    edges.forEach(function(v) {
      var from = v[0], to = v[1];
      if (!nodes[from]) nodes[from] = new Node(from);
      if (!nodes[to]) nodes[to]     = new Node(to);
      nodes[from].afters.push(to);
    });
    Object.keys(nodes).forEach(function visit(idstr, ancestors) {
      var node = nodes[idstr], id = node.id;
      if (visited[idstr]) return;
      if (!Array.isArray(ancestors)) ancestors = [];
      ancestors.push(id);
      visited[idstr] = true;
      node.afters.forEach(function(afterID) {
        (ancestors.indexOf(afterID) < 0) || err('closed chain : ' +  quo(afterID) + ' is in ' + quo(id));
        visit(afterID.toString(), ancestors.map(function(v) { return v }));
      });
      sorted.unshift(id);
    });
    return sorted;
  }

function quo(v) { return '"'+ v.toString().split('"').join('\\"') + '"'}

var N = 10000;
console.log( tsort([[1,2], [1,3],[2,4], [3,4]]))

console.time("tsort" + N);
for (i=0; i<N; i++) {
  tsort([[1,2], [1,3],[2,4], [3,4]])
}
console.timeEnd("tsort" + N);

