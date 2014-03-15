require 'coffee-script/register'
tcolor = require("termcolor").define
currentVersion = require("../package.json").version
oldVersion = "0.2.7"
dbs = {}
dbs[oldVersion]     = require "./jsrel-0.2.7.js"
dbs[currentVersion] = require "../jsrel.coffee"

resultDB = dbs[currentVersion].use __dirname + "/performance.json",
  schema:
    result:
      operation: true
      table : true
      version: true
      length: 1
      time: 1
  storage: "mock"

lines = require("fs").readFileSync(__dirname + "/hg19_kgXref.txt", "utf8").split("\n");
limits = [200, 500, 1000, 2000, 10000, 20000]

for limit in limits
  console.log "limit", limit
  for version, DB of dbs
    console.log "\tversion", version
    db = DB.use "#{__dirname}/kgxref_crud_#{version}_#{limit}.json",
      schema:
        index:
          name : true
          txt  : false
          $indexes: "name"
        noindex:
          name : true
          txt  : false

    for table in db.tables
      console.log "\t\t", "table", table
      records = lines.slice 0, limit

      # insert
      start = new Date
      db.ins(table, {name: record[0], txt: record[7]}) for record in records
      time = new Date - start
      result = resultDB.ins("result", operation: "insertion", table: table, version: version, length: limit, time: new Date - start)
      console.log "\t\t\t", "insertion", result.time, "sec"

      # update
      start = new Date
      db.upd(table, {id: id, name: "upd" + id}) for id in [1..limit]
      result = resultDB.ins("result", operation: "updating", table: table, version: version, length: limit, time: new Date - start)
      console.log "\t\t\t", "updateing", result.time, "sec"

      # find
      if limit < 5000 or table isnt "noindex" # omit searching noindex table when records >= 5000 as it's too slow to get results
        start = new Date
        db.one(table, {name: "upd" + id}) for id in [1..limit]
        result = resultDB.ins("result", operation: "searching", table: table, version: version, length: limit, time: new Date - start)
        console.log "\t\t\t", "searching", result.time, "sec"

      # delete 
      if limit < 12000 # omit deleting when records >= 12000 as it's too slow to execute
        start = new Date
        db.del(table, id) for id in [1..limit]
        result = resultDB.ins("result", operation: "deletion", table: table, version: version, length: limit, time: new Date - start)
        console.log "\t\t\t", "deletion", result.time, "sec"


###
# show results
###
# old vs current 
console.log "==================================================="
console.log "=========   COMPARING OLD AND CURRENT ============="
console.log "==================================================="

console.log ["operation", "table", "length", oldVersion, currentVersion, "#{oldVersion}/#{currentVersion}"].join("\t")
for operation in ["insertion", "updating", "searching", "deletion"]
  for table in ["index", "noindex"]
    for length in limits
      rs = resultDB.find "result", {operation: operation, table: table, length: length}, {order: "version"}
      continue if rs.length isnt 2
      cur = if rs[0].version is oldVersion then rs[1] else rs[0]
      old = if rs[0].version is oldVersion then rs[0] else rs[1]

      rate = Math.round(old.time*1000/cur.time)/1000
      color = if rate>=1 then "green" else "red"
      console[color] [operation, table, length, old.time, cur.time, rate].join("\t")

# index vs noindex
console.log "==================================================="
console.log "=========   COMPARING INDEX AND NOINDEX  =========="
console.log "==================================================="

console.log ["operation", "version", "length", "noindex", "index", "index/noindex"].join("\t")
for operation in ["insertion", "updating", "searching", "deletion"]
  for version of dbs
    for length in limits
      rs = resultDB.find "result", {operation: operation, version: version, length: length}, {order: "table"}
      continue if rs.length isnt 2
      idx  = rs[0]
      nidx = rs[1]
      rate = Math.round(nidx.time*1000/idx.time)/1000
      color = if rate>=1 then "green" else "red"
      console[color] [operation, version, length, nidx.time, idx.time, rate].join("\t")
