require 'coffee-script/register'
tcolor = require("termcolor").define
console.time "read"
dbs =
  coffee : require "../jsrel.coffee"
  old    : require "./jsrel-0.2.7.js"

LineStream = require "linestream"
schema =
  index:
    name : true
    txt  : false
    $indexes: "name"
  noindex:
    name : true
    txt  : false

resultDB = dbs.coffee.use "results",
  schema:
    result:
      operation: true
      table : true
      dbtype: true
      length: 1
      time: 1
  storage: "mock"

lines = []
LineStream.tsv(__dirname + "/hg19_kgXref.txt", (data)->
  lines.push data
).on "end", ()->
  measure = (limits)->
    for limit in limits
      console.log "limit", limit
      for libtype, DB of dbs
        console.log "\tdbtype", libtype
        db = DB.use "#{__dirname}/kgxref_crud_#{libtype}_#{limit}.json", schema: schema
        for table in db.tables
          console.log "\t\t", "table", table
          records = lines.slice 0, limit

          # insert
          start = new Date
          db.ins(table, {name: record[0], txt: record[7]}) for record in records
          time = new Date - start
          result = resultDB.ins("result", operation: "insertion", table: table, dbtype: libtype, length: limit, time: new Date - start)
          console.log "\t\t\t", "insertion", result.time, "sec"

          # update
          start = new Date
          db.upd(table, {id: id, name: "upd" + id}) for id in [1..limit]
          result = resultDB.ins("result", operation: "updating", table: table, dbtype: libtype, length: limit, time: new Date - start)
          console.log "\t\t\t", "updateing", result.time, "sec"

          # find
          if limit < 5000 or table isnt "noindex" # omit searching noindex table when records >= 5000 as it's too slow to get results
            start = new Date
            db.one(table, {name: "upd" + id}) for id in [1..limit]
            result = resultDB.ins("result", operation: "searching", table: table, dbtype: libtype, length: limit, time: new Date - start)
            console.log "\t\t\t", "searching", result.time, "sec"

          # delete 
          if limit < 12000 # omit deleting when records >= 12000 as it's too slow to execute
            start = new Date
            db.del(table, id) for id in [1..limit]
            result = resultDB.ins("result", operation: "deletion", table: table, dbtype: libtype, length: limit, time: new Date - start)
            console.log "\t\t\t", "deletion", result.time, "sec"

  lengths = [200, 500, 1000, 2000, 10000, 20000]
  measure lengths

 # show results
  # old vs coffee
  console.log "==================================================="
  console.log "=========   COMPARING OLD AND COFFEE  ============="
  console.log "==================================================="

  console.log ["operation", "table", "length", "old", "coffee", "old/coffee"].join("\t")
  for operation in ["insertion", "updating", "searching", "deletion"]
    for table in ["index", "noindex"]
      for length in lengths
        rs = resultDB.find "result", {operation: operation, table: table, length: length}, {order: "dbtype"}
        continue if rs.length isnt 2
        cof = rs[0]
        old = rs[1]
        rate = Math.round(old.time*1000/cof.time)/1000
        color = if rate>=1 then "green" else "red"
        console[color] [operation, table, length, old.time, cof.time, rate].join("\t")

  # index vs noindex
  console.log "==================================================="
  console.log "=========   COMPARING INDEX AND NOINDEX  =========="
  console.log "==================================================="

  console.log ["operation", "dbtype", "length", "noindex", "index", "index/noindex"].join("\t")
  for operation in ["insertion", "updating", "searching", "deletion"]
    for dbtype in ["old", "coffee"]
      for length in lengths
        rs = resultDB.find "result", {operation: operation, dbtype: dbtype, length: length}, {order: "table"}
        continue if rs.length isnt 2
        idx  = rs[0]
        nidx = rs[1]
        rate = Math.round(nidx.time*1000/idx.time)/1000
        color = if rate>=1 then "green" else "red"
        console[color] [operation, dbtype, length, nidx.time, idx.time, rate].join("\t")
