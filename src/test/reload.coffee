JSRel = require('../lib/jsrel.js')
vows = require('vows')
assert = require('assert')
fs = require("fs")

filename = __dirname + "/tmp/reload"
fs.unlinkSync filename if fs.existsSync filename

schema =
  table1:
    col1: 1
    col2: true
  table2:
    col3: 1
    col4: false

db = JSRel.use(filename, schema: schema)

db.save()

vows.describe('== TESTING RELOAD ==').addBatch(
  reload:
    topic: null

    reload: ->
      JSRel._dbInfos = {} # private...
      reloaded_db = JSRel.use(filename, schema: schema)
      assert.equal(reloaded_db.tables.length, 2)

).export(module)
