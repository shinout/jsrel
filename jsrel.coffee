((root, factory) ->
  if typeof define is "function" and define.amd
    define ["sortedlist"], factory
  else if typeof module is "object" and module.exports
    module.exports = factory()
  else
    root.JSRel = factory(root.SortedList)
  return
) this, (SortedList) ->

  # no operation
  noop = ->

  # throws error
  err = (args...)->
    args.push "(undocumented error)" if args.length is 0
    args.unshift "[JSRel]"
    throw new Error(args.join(" "))
  
  ###
  shallowly copy the given object
  ###
  copy = (obj) ->
    ret = {}
    for attr of obj
      ret[attr] = obj[attr]  if obj.hasOwnProperty(attr)
    ret
  
  ###
  deeply copy the given value
  ###
  deepCopy = (val) ->
    return val.map(deepCopy)  if Array.isArray(val)
    return val  if typeof val isnt "object" or val is null or val is `undefined`
    ret = {}
    for attr of val
      ret[attr] = deepCopy val[attr]  if val.hasOwnProperty attr
    return ret

  unique = (arr) ->
    o = {}
    arr.filter (i) ->
      (if i of o then false else o[i] = true)

  cup = (arr) ->
    unique Array::concat.apply([], arr)
  quo = (v) ->
    "\"" + v.toString().split("\"").join("\\\"") + "\""
  bq = (v) ->
    "`" + v + "`"
  
  # arrayize if not
  arrayize = (v, empty) ->
    (if Array.isArray(v) then v else (if (empty and not v?) then [] else [v]))
  
  # objectize if string
  objectize = (k, v) ->
    return k  unless typeof k is "string"
    obj = {}
    obj[k] = v
    obj
  
  # sort arrToHash by order of arrToItr
  hashFilter = (arrToItr, arrToHash) ->
    hash = {}
    i = 0
    l = arrToHash.length

    while i < l
      hash[arrToHash[i]] = true
      i++
    ret = new Array(arrToHash.length)
    k = 0
    j = 0
    l = arrToItr.length

    while j < l
      v = arrToItr[j]
      ret[k++] = v  if hash[v]?
      j++
    ret
  SortedList = require("sortedlist")  unless SortedList
  isTitanium = (typeof Ti is "object" and typeof Titanium is "object" and Ti is Titanium)
  isNode = not isTitanium and (typeof module is "object" and typeof exports is "object" and module.exports is exports)
  isBrowser = (typeof localStorage is "object" and typeof sessionStorage is "object")
  storages = mock: (->
    mockData = {}
    getItem: (id) ->
      mockData[id] or null

    setItem: (id, data) ->
      mockData[id] = data
      return

    removeItem: (id) ->
      delete mockData[id]

      return
  )()
  if isBrowser
    storages.local = window.localStorage
    storages.session = window.sessionStorage
  if isTitanium
    fs = Ti.Filesystem
    storages.file =
      getItem: (k) ->
        file = fs.getFile(k.toString())
        (if file.exists() then fs.getFile(k.toString()).read().text else null)

      setItem: (k, v) ->
        fs.getFile(k.toString()).write v.toString()

      removeItem: (k) ->
        fs.getFile(k.toString()).deleteFile()
  else if isNode
    fs = require("fs")
    storages.file =
      getItem: (k) ->
        try
          return fs.readFileSync(k, "utf8")
        catch e
          return null
        return

      setItem: (k, v) ->
        fs.writeFileSync k, v.toString(), "utf8"

      removeItem: (k) ->
        fs.unlinkSync k
  JSRel = (uniqId, name, storage, autosave, format, tblData) ->
    Object.defineProperty this, "id",
      value: uniqId
      writable: false

    Object.defineProperty this, "name",
      value: name
      writable: false

    @_storage = storage
    @_autosave = autosave
    @constructor._dbInfos[uniqId] =
      db: this
      storage: storage

    @_hooks = {}

    @_tblInfos = {}
    for tblName, colData of tblData
      @_tblInfos[tblName] = new Table(tblName, this, colData, format)
    return

  JSRel._dbInfos = {}
  Object.defineProperties JSRel,
    uniqIds:
      get: ->
        Object.keys @_dbInfos

      set: noop

    isNode:
      value: isNode
      writable: false

    isTitanium:
      value: isTitanium
      writable: false

    isBrowser:
      value: isBrowser
      writable: false

    storages:
      value: storages
      writable: false

  JSRel.use = (uniqId, options) ->
    (uniqId) or err("uniqId is required and must be non-zero value.")
    uniqId = uniqId.toString()
    return @_dbInfos[uniqId].db  if @_dbInfos[uniqId] and (not options or not options.reset)
    (options) or err("options is required.")
    options.storage = (if (isNode or isTitanium) then "file" else (if (isBrowser) then "local" else "mock"))  unless options.storage
    storage = @storages[options.storage]
    (storage) or err("options.storage must be one of [\"" + Object.keys(@storages).join("\", \"") + "\"]")
    format = undefined
    tblData = undefined
    dbstr = storage.getItem(uniqId)
    if dbstr and not options.reset
      try
        dbinfo = JSON.parse(dbstr)
      catch e
        throw new Error("Invalid JSON given. in db", quo(uniqId))
      format = dbinfo.f
      tblData = dbinfo.t
      (format) or err("format is not given in stringified data in db", uniqId)
    else
      (options.schema and typeof options.schema is "object") or err("options.schema is required")
      (Object.keys(options.schema).length) or err("schema must contain at least one table")
      format = "Schema"
      tblData = deepCopy(options.schema)
    name = (if (options.name?) then options.name.toString() else uniqId)
    new JSRel(uniqId, name, options.storage, !!options.autosave, format, tblData)

  JSRel.$import = (uniqId, str, options) ->
    options or (options = {})
    (uniqId) or err("uniqId is required and must be non-zero value.")
    uniqId = uniqId.toString()
    (options.force or not @_dbInfos[uniqId]?) or err("id", quo(uniqId), "already exists")
    try
      d = JSON.parse(str)
    catch e
      throw new Error("Invalid format given.")
    [
      "n"
      "s"
      "a"
      "f"
      "t"
    ].forEach (k) ->
      (d.hasOwnProperty(k)) or err("Invalid Format given.")
      return

    new JSRel(uniqId, d.n, d.s, d.a, d.f, d.t)

  JSRel.free = (uniqId) ->
    delete @_dbInfos[uniqId]

    return

  JSRel.remove = (uniqId) ->
    jsrel = @_dbInfos[uniqId]
    return  if not jsrel or not jsrel.db
    @free uniqId
    jsrel.db.storage.removeItem uniqId
    return

  JSRel._compress = (tblData) ->
    Object.keys(tblData).reduce ((ret, tblName) ->
      ret[tblName] = tblData[tblName]._compress()
      ret
    ), {}

  Object.defineProperty JSRel::, "storage",
    get: ->
      JSRel.storages[@_storage]

    set: noop

  Object.defineProperty JSRel::, "tables",
    get: ->
      Object.keys @_tblInfos

    set: noop

  Object.defineProperty JSRel::, "schema",
    get: ->
      tableDescriptions = {}
      @tables.forEach ((tableName) ->
        table = @_tblInfos[tableName]
        columnDescriptions = {}
        table.columns.forEach (colName) ->
          return  if colName is "id" or colName is "ins_at" or colName is "upd_at"
          colInfo = table._colInfos[colName]
          columnDescriptions[colName] =
            type: Table.TYPES[colInfo.type]
            required: colInfo.required
            _default: colInfo._default

          return

        columnDescriptions.$indexes = []
        columnDescriptions.$uniques = []
        Object.keys(table._indexes).forEach (col) ->
          return  if col is "id" or col is "ins_at" or col is "upd_at"
          unique = table._indexes[col]._unique
          columnDescriptions[(if unique then "$uniques" else "$indexes")].push col.split(",")
          return

        columnDescriptions.$classes = Object.keys(table._classes).map((col) ->
          col.split ","
        )
        [
          "$indexes"
          "$uniques"
          "$classes"
        ].forEach (key) ->
          delete columnDescriptions[key]  if columnDescriptions[key].length is 0
          return

        tableDescriptions[tableName] = columnDescriptions
        return
      ), this
      tableDescriptions

    set: noop

  JSRel::table = (tableName) ->
    @_tblInfos[tableName]

  JSRel::save = (noCompress) ->
    (@_hooks["save:start"]) and @_emit("save:start", @origin())
    data = @$export(noCompress)
    @storage.setItem @id, data
    @_emit "save:end", data
    this

  JSRel::origin = ->
    @storage.getItem @id

  JSRel::$export = (noCompress) ->
    ret =
      n: @name
      s: @_storage
      a: @_autosave

    ret.t = (if (noCompress) then @_tblInfos else JSRel._compress(@_tblInfos))
    ret.f = (if (noCompress) then "Raw" else "Compressed")
    JSON.stringify ret

  JSRel::toSQL = (options) ->
    options or (options =
      type: "mysql"
      engine: "InnoDB"
    )
    if options.rails
      datetime = (v) ->
        n2s = (n) ->
          ("000" + n).match /..$/
        t = new Date(v)
        t.getFullYear() + "-" + n2s(t.getMonth() + 1) + "-" + n2s(t.getDate()) + " " + n2s(t.getHours()) + ":" + n2s(t.getMinutes()) + ":" + n2s(t.getSeconds())

      (options.columns) or (options.columns = {})
      (options.values) or (options.values = {})
      options.columns.upd_at = "updated_at"
      options.columns.ins_at = "created_at"
      options.values.upd_at = datetime
      options.values.ins_at = datetime
    ret = []
    if options.db
      dbname = (if options.db is true then @id else options.db.toString())
      ret.push "CREATE DATABASE `" + dbname + "`;"
      ret.push "USE `" + dbname + "`;"
    tables = @tables
    if not options.noschema and not options.nodrop
      ret.push tables.map((tbl) ->
        @table(tbl)._toDropSQL options
      , this).reverse().join("\n")
    unless options.noschema
      ret.push tables.map((tbl) ->
        @table(tbl)._toCreateSQL options
      , this).join("\n")
    unless options.nodata
      ret.push tables.map((tbl) ->
        @table(tbl)._toInsertSQL options
      , this).join("\n")
    ret.join "\n"

  JSRel::close = ->

  JSRel::on = (evtname, fn, options) ->
    options or (options = {})
    @_hooks[evtname] = []  unless @_hooks[evtname]
    @_hooks[evtname][(if options.unshift then "unshift" else "push")] fn
    return

  JSRel::off = (evtname, fn) ->
    return  unless @_hooks[evtname]
    return @_hooks[evtname] = null  unless fn?
    @_hooks[evtname] = @_hooks[evtname].filter((f) ->
      fn isnt f
    )
    return

  JSRel::drop = (tblNames...)->
    nonRequiredReferringTables = {}
    tblNames.forEach ((tblName) ->
      table = @_tblInfos[tblName]
      (table) or err("unknown table name", quo(tblName), "in jsrel#drop")
      Object.keys(table._referreds).forEach (refTblName) ->
        Object.keys(table._referreds[refTblName]).forEach (col) ->
          if table._referreds[refTblName][col]
            (tblNames.indexOf(refTblName) >= 0) or err("table ", quo(tblName), "has its required-referring table", quo(refTblName), ", try jsrel#drop('" + tblName + "', '" + refTblName + "')")
          else
            nonRequiredReferringTables[refTblName] = col
          return

        return

      return
    ), this
    tblNames.forEach ((tblName) ->
      table = @_tblInfos[tblName]
      Object.keys(table._rels).forEach ((relname) ->
        relTblName = table._rels[relname]
        return  if tblNames.indexOf(relTblName) >= 0
        relTable = @_tblInfos[relTblName]
        delete relTable._referreds[tblName]

        return
      ), this
      [
        "_colInfos"
        "_indexes"
        "_idxKeys"
        "_classes"
        "_data"
        "_rels"
        "_referreds"
      ].forEach ((prop) ->
        delete table[prop]

        return
      ), this
      delete @_tblInfos[tblName]

      return
    ), this
    Object.keys(nonRequiredReferringTables).forEach ((refTblName) ->
      col = nonRequiredReferringTables[refTblName]
      refTable = @_tblInfos[refTblName]
      Object.keys(refTable._data).forEach (id) ->
        refTable._data[id][col + "_id"] = null
        return

      return
    ), this
    this

  JSRel::_emit = (args...)->
    evtname = args.shift()
    if Array.isArray(@_hooks[evtname])
      @_hooks[evtname].forEach (fn) ->
        fn.apply this, args
        return

    return

  Table = (name, db, colData, format) ->
    Object.defineProperty this, "name",
      value: name
      writable: false

    Object.defineProperty this, "db",
      value: db
      writable: false

    @_colInfos = {}
    @_data = {}
    @_indexes = {}
    @_idxKeys = {}
    @_classes = {}
    @_rels = {}
    @_referreds = {}
    (typeof Table::["_parse" + format] is "function") or err("unknown format", quo(format), "given in", quo(@db.id))
    this["_parse" + format] colData
    columns = Object.keys(@_colInfos).sort()
    Object.freeze columns
    Object.defineProperty this, "columns",
      value: columns
      writable: false

    colOrder = {}
    columns.forEach (col, k) ->
      colOrder[col] = k
      return

    Object.freeze colOrder
    Object.defineProperty this, "colOrder",
      value: colOrder
      writable: false

    return

  JSRel.Table = Table
  Object.defineProperties Table,
    _BOOL:
      value: 1
      writable: false

    _NUM:
      value: 2
      writable: false

    _STR:
      value: 3
      writable: false

    _INT:
      value: 4
      writable: false

    _CHRS:
      value: 5
      writable: false

    _CHR2:
      value: 6
      writable: false

    TYPES:
      value:
        1: "boolean"
        2: "number"
        3: "string"
        4: "number"
        5: "string"
        6: "string"

      writable: false

    ID_TEMP:
      value: 0
      writable: false

    INVALID_COLUMNS:
      value: [
        "id"
        "ins_at"
        "upd_at"
        "on"
        "off"
        "str"
        "num"
        "bool"
        "int"
        "float"
        "text"
        "chars"
        "double"
        "string"
        "number"
        "boolean"
        "order"
        "limit"
        "offset"
        "join"
        "where"
        "as"
        "select"
        "explain"
      ]
      writable: false

    AUTO:
      value:
        id: true
        ins_at: true
        upd_at: true

      writable: false

    NOINDEX_MIN_LIMIT:
      value: 100
      writable: false

    COLKEYS:
      value: [
        "name"
        "type"
        "required"
        "_default"
        "rel"
        "sqltype"
      ]
      writable: false

    TYPE_SQLS:
      value:
        1: "tinyint(1)"
        2: "double"
        3: "text"
        4: "int"
        5: "varchar(255)"
        6: "varchar(160)"

      writable: false

  Table::ins = (obj, options) ->
    options or (options = {})
    (obj and typeof obj is "object") or err("You must pass object to table.ins().")
    @_convertRelObj obj
    unless options.force
      delete obj.id

      delete obj.ins_at

      delete obj.upd_at
    else
      [
        "id"
        "ins_at"
        "upd_at"
      ].forEach (col) ->
        obj[col] = Number(obj[col])  if col of obj
        return

    insObj = {}
    @columns.forEach ((col) ->
      insObj[col] = obj[col]
      @_cast col, insObj
      return
    ), this
    Object.keys(@_rels).forEach ((col) ->
      idcol = col + "_id"
      exId = insObj[idcol]
      tbl = @db.table(@_rels[col])
      required = @_colInfos[idcol].required
      return  if not required and not exId?
      exObj = tbl.one(exId)
      if not required and not exObj?
        insObj[idcol] = null
        return
      (exObj) or err("invalid external id", quo(idcol), ":", exId)
      return
    ), this
    insObj.id or (insObj.id = @_getNewId())
    (not @_data[insObj.id]) or err("the given id \"", insObj.id, "\" already exists.")
    (insObj.id isnt Table.ID_TEMP) or err("id cannot be", Table.ID_TEMP)
    insObj.ins_at = new Date().getTime()  unless insObj.ins_at?
    insObj.upd_at = insObj.ins_at  unless insObj.upd_at?
    @_data[insObj.id] = insObj
    try
      Object.keys(@_indexes).forEach ((idxName) ->
        @_checkUnique idxName, insObj
        return
      ), this
    catch e
      delete @_data[insObj.id]
      throw e
      return null
    Object.keys(@_indexes).forEach ((columns) ->
      list = @_indexes[columns]
      list.insert insObj.id
      return
    ), this
    Object.keys(@_classes).forEach ((columns) ->
      cls = @_classes[columns]
      values = columns.split(",").map((col) ->
        insObj[col]
      ).join(",")
      cls[values] = {}  unless cls[values]
      cls[values][insObj.id] = 1
      return
    ), this
    @db._emit "ins", @name, insObj
    @db._emit "ins:" + @name, insObj
    @_insertRelations obj, insObj
    @db.save()  if @db._autosave
    copy insObj

  Table::_insertRelations = (obj, insObj) ->
    Object.keys(@_referreds).forEach ((exTbl) ->
      cols = Object.keys(@_referreds[exTbl])
      inserts = {}
      if cols.length is 1
        col = cols[0]
        arr = obj[exTbl] or obj[exTbl + "." + col]
        return  unless Array.isArray(arr)
        inserts[col] = arr
      else
        cols.forEach (col) ->
          arr = obj[exTbl + "." + col]
          return  unless Array.isArray(arr)
          inserts[col] = arr
          return

      Object.keys(inserts).forEach ((col) ->
        arr = inserts[col]
        tbl = @db.table(exTbl)
        inserts[col].forEach (v) ->
          v[col + "_id"] = insObj.id
          tbl.ins v
          return

        return
      ), this
      return
    ), this
    return

  Table::upd = (obj, options) ->
    options or (options = {})
    (obj and obj.id? and obj.id isnt Table.ID_TEMP) or err("id is not found in the given object.")
    obj.id = Number(obj.id)
    old = @_data[obj.id]
    (old) or err("Cannot update. Object not found in table", @name)
    unless options.force
      delete obj.ins_at

      delete obj.upd_at
    else
      obj.ins_at = Number(obj.ins_at)  if "ins_at" of obj
      obj.upd_at = new Date().getTime()
    @_convertRelObj obj
    updObj = id: obj.id
    updKeys = []
    @columns.forEach ((col) ->
      if obj.hasOwnProperty(col)
        v = obj[col]
        updObj[col] = v
        updKeys.push col  if v isnt old[col]
        @_cast col, obj
      else
        updObj[col] = old[col]
      return
    ), this
    updKeys.forEach ((col) ->
      tbl = @_rels[col]
      return  unless tbl
      idcol = col + "_id"
      if idcol of updObj
        exId = updObj[idcol]
        required = @_colInfos[idcol].required
        return  if not required and not exId?
        exObj = @db.one(tbl, exId)
        if not required and not exObj?
          updObj[idcol] = null
          return
        (exObj) or err("invalid external id", quo(idcol), ":", exId)
      return
    ), this
    updIndexPoses = {}
    updKeys.forEach ((column) ->
      idxNames = @_idxKeys[column]
      return  unless idxNames
      idxNames.forEach ((idxName) ->
        list = @_indexes[idxName]
        list.keys(updObj.id).some (k) ->
          if list[k] is updObj.id
            updIndexPoses[idxName] = k
            true

        (updIndexPoses[idxName] >= 0) or err("invalid index position: ", idxName, "in", updObj.id)
        list.remove updIndexPoses[idxName]
        return
      ), this
      return
    ), this
    @_data[obj.id] = updObj
    try
      updKeys.forEach ((column) ->
        idxNames = @_idxKeys[column]
        return  unless idxNames
        idxNames.forEach ((idxName) ->
          @_checkUnique idxName, updObj
          return
        ), this
        return
      ), this
    catch e
      @_data[obj.id] = old
      Object.keys(updIndexPoses).forEach ((idxName) ->
        @_indexes[idxName].insert old.id
        return
      ), this
      throw ereturn null
    Object.keys(updIndexPoses).forEach ((idxName) ->
      list = @_indexes[idxName]
      list.insert obj.id
      return
    ), this
    Object.keys(@_classes).forEach ((columns) ->
      cls = @_classes[columns]
      cols = columns.split(",")
      toUpdate = cols.every((col) ->
        updKeys.indexOf(col) >= 0
      )
      return  unless toUpdate
      oldval = cols.map((col) ->
        old[col]
      )
      newval = cols.map((col) ->
        updObj[col]
      )
      return  if oldval is newval
      (cls[oldval][updObj.id] is 1) or err("update object is not in classes.", updObj.id, "in table", quo(@name))
      delete cls[oldval][updObj.id]

      delete cls[oldval]  if Object.keys(cls[oldval]).length is 0
      cls[newval] = {}  unless cls[newval]
      cls[newval][updObj.id] = 1
      return
    ), this
    @db._emit "upd", @name, updObj, old, updKeys
    @db._emit "upd:" + @name, updObj, old, updKeys
    @_updateRelations obj, updObj, options.append
    @db.save()  if @db._autosave
    updObj

  Table::_updateRelations = (obj, updObj, append) ->
    Object.keys(@_referreds).forEach ((exTbl) ->
      cols = Object.keys(@_referreds[exTbl])
      updates = {}
      if cols.length is 1
        col = cols[0]
        arr = obj[exTbl] or obj[exTbl + "." + col]
        return  unless Array.isArray(arr)
        updates[col] = arr
      else
        cols.forEach (col) ->
          arr = obj[exTbl + "." + col]
          return  unless Array.isArray(arr)
          updates[col] = arr
          return

      Object.keys(updates).forEach ((col) ->
        arr = updates[col]
        idhash = arr.reduce((o, v) ->
          o[v.id] = v  if v.id
          o
        , {})
        query = {}
        query[col + "_id"] = updObj.id
        tbl = @db.table(exTbl)
        oldIds = tbl.find(query,
          select: "id"
        )
        unless append
          oldIds.forEach (id) ->
            tbl.del id  unless idhash[id]
            return

        oldIds.forEach (id) ->
          tbl.upd idhash[id]  if idhash[id]
          return

        arr.forEach (v) ->
          return  if v.id
          v[col + "_id"] = updObj.id
          tbl.ins v
          return

        return
      ), this
      return
    ), this
    return

  Table::find = (query, options, _priv) ->
    options or (options = {})
    _priv or (_priv = {})
    report = Table._buildReportObj(options.explain)
    keys = @_indexes.id
    query = (if (_priv.normalized) then query else Table._normalizeQuery(query))
    if query
      keys = cup(query.map((condsList) ->
        ks = null
        Object.keys(condsList).forEach ((column) ->
          ks = cup(condsList[column].map((cond) ->
            localKeys = (if ks then ks.slice() else null)
            Object.keys(cond).forEach ((condType) ->
              localKeys = @_optSearch(column, condType, cond[condType], localKeys, report)
              return
            ), this
            localKeys
          , this))
          return
        ), this
        ks
      , this))
    else report.searches.push searchType: "none"  if report
    joins = null
    joinCols = null
    if options.join
      joinInfos = @_getJoinInfos(options.join)
      joins = {}
      joinCols = []
      reqCols = []
      joinInfos.N.forEach ((info) ->
        report and Table._reportSubQuery(report, info, "1:N")
        idcol = info.col
        name = info.name
        tblObj = @db.table(info.tbl)
        joinCols.push name
        reqCols.push name  if info.req
        if info.emptyArray
          keys.forEach (id) ->
            joins[id] = {}  unless joins[id]
            joins[id][name] = []  unless joins[id][name]
            return

        tblObj.find(info.query, info.options,
          usedTables: _priv.usedTables
        ).forEach (result) ->
          id = result[idcol]
          joins[id] = {}  unless joins[id]
          joins[id][name] = []  unless joins[id][name]
          joins[id][name].push result
          return

        if info.offset? or info.limit?
          Object.keys(joins).forEach (id) ->
            arr = joins[id][name]
            joins[id][name] = Table._offsetLimit(arr, info.offset, info.limit)  if arr
            return

        if info.select
          if typeof info.select is "string"
            Object.keys(joins).forEach (id) ->
              arr = joins[id][name]
              if arr
                joins[id][name] = joins[id][name].map((v) ->
                  v[info.select]
                )
              return

          else
            (Array.isArray(info.select)) or err("typeof options.select must be one of string, null, array")
            Object.keys(joins).forEach (id) ->
              arr = joins[id][name]
              if arr
                joins[id][name] = join[id][name].map((v) ->
                  info.select.reduce ((ret, k) ->
                    ret[k] = v[k]
                    ret
                  ), {}
                )
              return

        return
      ), this
      joinInfos[1].forEach ((info) ->
        report and Table._reportSubQuery(report, info, "N:1")
        idcol = info.col
        name = info.name
        tblObj = @db.table(info.tbl)
        q = Table._normalizeQuery(info.query)
        joinCols.push name
        reqCols.push name  if info.req
        keys.forEach ((id) ->
          exId = tblObj._survive(@_data[id][idcol], q, true)
          return  unless exId?
          joins[id] = {}  unless joins[id]
          joins[id][name] = tblObj._data[exId]
          return
        ), this
        return
      ), this
      keys = keys.filter((id) ->
        joinColObj = joins[id]
        joinColObj = {}  unless joinColObj
        reqCols.every (col) ->
          joinColObj[col]

      , this)
    keys = @_orderBy(keys, options.order, report)
    keys = Table._offsetLimit(keys, options.offset, options.limit)
    res = @_select(keys, options.select, joins, joinCols)
    return res  unless options.groupBy
    ret = {}
    keyColumn = (if options.groupBy is true then "id" else options.key)
    res.forEach (item) ->
      ret[item[keyColumn]] = item
      return

    ret

  Table::one = (query, options, _priv) ->
    query = id: query  if typeof query is "number" or not isNaN(Number(query))
    ret = @find(query, options, _priv)
    (if (ret.length) then ret[0] else null)

  Table::count = (query) ->
    return @_indexes.id.length  unless query
    @find(query,
      select: "id"
    ).length

  Table::del = (arg, options) ->
    options or (options = {})
    delList = undefined
    if typeof arg is "number"
      (@_data[arg]) or err("id", arg, "is not found in table", @name)
      delList = [@_data[arg]]
    else
      delList = @find(arg)
    delList.forEach ((obj) ->
      Object.keys(@_indexes).forEach ((idxName) ->
        list = @_indexes[idxName]
        keys = list.keys(obj.id)
        (keys?) or err("invalid keys")
        bool = keys.some((key) ->
          if obj.id is list[key]
            list.remove key
            true
        )
        (bool) or err("index was not deleted.")
        return
      ), this
      Object.keys(@_classes).forEach ((columns) ->
        cls = @_classes[columns]
        cols = columns.split(",")
        val = cols.map((col) ->
          obj[col]
        )
        (cls[val][obj.id] is 1) or err("deleting object is not in classes.", quo(obj.id), "in table", quo(@name))
        delete cls[val][obj.id]

        delete cls[val]  if Object.keys(cls[val]).length is 0
        return
      ), this
      delete @_data[obj.id]

      @db._emit "del", @name, obj
      @db._emit "del:" + @name, obj
      Object.keys(@_referreds).forEach ((exTable) ->
        query = {}
        info = @_referreds[exTable]
        Object.keys(info).forEach ((colName) ->
          required = info[colName]
          query[colName + "_id"] = obj.id
          if required
            @db.table(exTable).del query,
              sub: true

          else
            upd = {}
            upd[colName + "_id"] = null
            @db.table(exTable).find(query).forEach ((o) ->
              upd.id = o.id
              @db.table(exTable).upd upd,
                sub: true

              return
            ), this
          return
        ), this
        return
      ), this
      return
    ), this
    @db.save()  if @db._autosave
    this

  Table::_getNewId = ->
    len = @_indexes.id.length
    return 1  unless len
    @_indexes.id[len - 1] + 1

  Table::_optSearch = (col, condType, value, ids, report) ->
    (@_colInfos[col]) or err("unknown column", quo(col))
    lists =
      index: @_indexes[col]
      classes: @_classes[col]
      noIndex: ids

    searchType = undefined
    if (ids and ids.length < Table.NOINDEX_MIN_LIMIT) or (not lists.index and not lists.classes) or condType is "like"
      searchType = "noIndex"
    else
      switch condType
        when "equal", "$in"
          searchType = (if lists.classes then "classes" else "index")
        when "gt", "ge", "lt", "le"
          searchType = (if lists.index then "index" else "classes")
        when "like$"
          searchType = (if lists.index then "index" else "noIndex")
        else
          err "undefined condition", quo(condType)
    result = Queries[searchType][condType].call(this, col, value, lists[searchType] or @_indexes.id)
    ret = (if (searchType is "noIndex" or not ids) then result else hashFilter(ids, result))
    if report
      report.searches.push
        searchType: searchType
        condition: condType
        column: col
        value: value
        count: result.length
        before: (if ids then ids.length else null)
        after: ret.length

    ret

  Table::_idxSearch = (list, obj, fn, nocopy) ->
    ob = (if (nocopy) then obj else copy(obj))
    ob.id = Table.ID_TEMP  unless ob.id?
    @_data[Table.ID_TEMP] = ob
    ret = fn.call(this, ob, @_data)
    delete @_data[Table.ID_TEMP]

    ret

  Table::_idxSearchByValue = (list, col, value, fn) ->
    obj = {}
    obj[col] = value
    @_idxSearch list, obj, fn, true

  Table::_convertRelObj = (obj) ->
    Object.keys(@_rels).forEach (col) ->
      return  if obj[col + "_id"]?
      if obj[col] and obj[col].id?
        obj[col + "_id"] = obj[col].id
        delete obj[col]
      return

    obj

  Table::_cast = (colName, obj) ->
    val = obj[colName]
    return  if Table.AUTO[colName] and not val?
    colInfo = @_colInfos[colName]
    return  if typeof val is Table.TYPES[colInfo.type]
    if not colInfo.required and not val?
      val = colInfo._default
    else
      (val?) or err("column", "\"" + colName + "\"", "is required.")
      switch colInfo.type
        when Table._NUM
          val = Number(val)
          (not isNaN(val)) or err(quo(colName), ":", quo(obj[colName]), "is not a valid number.")
        when Table._BOOL
          val = !!val
        when Table._STR
          (typeof val.toString is "function") or err("cannot convert", val, "to string")
          val = val.toString()
    obj[colName] = val
    obj

  Table::_checkUnique = (idxName, obj) ->
    list = @_indexes[idxName]
    return  unless list._unique
    @_idxSearch list, obj, (tmpObj, data) ->
      (not (list.key(tmpObj.id)?)) or err("duplicated entry :", idxName.split(",").map((col) ->
        obj[col]
      ).join(","), "in", idxName)
      return

    return

  Table::_compress = ->
    cData = Table._compressData(@_colInfos, @_data, @_indexes, @_idxKeys)
    cClasses = Table._compressClasses(@_classes)
    cRels = Table._compressRels(@_rels, @_referreds)
    [
      cData
      cClasses
      cRels
    ]

  Table._compressData = (colInfos, data, indexes, idxKeys) ->
    cols = []
    compressedColInfos = Object.keys(colInfos).map((col) ->
      colInfo = colInfos[col]
      cols.push colInfo.name
      Table.COLKEYS.map (key) ->
        colInfo[key]

    , this)
    boolTypes = cols.reduce((ret, col) ->
      ret[col] = 1  if colInfos[col].type is Table._BOOL
      ret
    , {})
    compressedData = Object.keys(data).map((id) ->
      obj = data[id]
      cols.map (col) ->
        (if (boolTypes[col]) then (if obj[col] then 1 else 0) else obj[col])

    , this)
    compressedIndexes = Object.keys(indexes).map((idxName) ->
      list = indexes[idxName]
      [
        idxName
        list._unique
        list.toArray()
      ]
    )
    [
      compressedColInfos
      compressedData
      compressedIndexes
    ]

  Table._decompressData = (cdata) ->
    infos = cdata[0]
    darr = cdata[1]
    cIndexes = cdata[2]
    colInfos = {}
    cols = infos.map((info, k) ->
      obj = {}
      Table.COLKEYS.forEach (colkey, n) ->
        obj[colkey] = info[n]
        return

      col = obj.name
      colInfos[col] = obj
      col
    )
    boolTypes = cols.reduce((ret, col) ->
      ret[col] = 1  if colInfos[col].type is Table._BOOL
      ret
    , {})
    data = darr.reduce((ret, d, k) ->
      record = {}
      cols.forEach (col, k) ->
        record[col] = (if boolTypes[col] then !!d[k] else d[k])
        return

      ret[record.id] = record
      ret
    , {})
    indexes = cIndexes.reduce((indexes, nameUniqArr) ->
      idxName = nameUniqArr[0]
      columns = idxName.split(",")
      uniq = nameUniqArr[1]
      types = columns.map((col) ->
        colInfos[col].type
      )
      arr = nameUniqArr[2]
      indexes[idxName] = Table._getIndex(columns, uniq, types, arr, data)
      indexes
    , {})
    idxKeys = Table._getIdxKeys(indexes)
    [
      colInfos
      data
      indexes
      idxKeys
    ]

  Table._compressClasses = (classes) ->
    Object.keys(classes).map (col) ->
      cls = classes[col]
      cols = cls.cols
      delete cls.cols

      vals = Object.keys(cls).map((val) ->
        [
          val
          Object.keys(cls[val]).map((v) ->
            Number v
          )
        ]
      )
      cls.cols = cols
      [
        col
        vals
      ]


  Table._decompressClasses = (cClasses) ->
    cClasses.reduce ((classes, colvals) ->
      col = colvals[0]
      classes[col] = colvals[1].reduce((cls, valkeys) ->
        val = valkeys[0]
        cls[val] = valkeys[1].reduce((idhash, id) ->
          idhash[id] = 1
          idhash
        , {})
        cls
      , {})
      classes[col].cols = col.split(",")
      classes
    ), {}

  Table._compressRels = (rels, referreds) ->
    [
      rels
      referreds
    ]

  Table._decompressRels = (c) ->
    c

  Table._columnToSQL = (info, colConverts) ->
    colType = Table.TYPE_SQLS[info.sqltype]
    name = (if (info.name of colConverts) then colConverts[info.name] else info.name)
    stmt = [
      bq(name)
      colType
    ]
    stmt.push "NOT NULL"  if info.required
    if info._default?
      defa = (if (info.type is Table._BOOL) then (if info._default then 1 else 0) else (if (info.type is Table._STR) then quo(info._default) else info._default))
      stmt.push "DEFAULT", defa
    stmt.push "PRIMARY KEY AUTO_INCREMENT"  if name is "id"
    stmt.join " "

  Table._idxToSQL = (name, list, colConverts) ->
    return  if name is "id"
    name = colConverts[name]  if name of colConverts
    uniq = (if (list._unique) then "UNIQUE " else "")
    [
      uniq + "INDEX"
      "(" + name + ")"
    ].join " "

  Table::_toDropSQL = (options) ->
    ifExist = true
    "DROP TABLE " + ((if ifExist then "IF EXISTS " else "")) + bq(@name) + ";"

  Table::_toCreateSQL = (options) ->
    options or (options = {})
    colConverts = options.columns or {}
    delete colConverts.id

    substmts = @columns.map((col) ->
      Table._columnToSQL @_colInfos[col], colConverts
    , this)
    Object.keys(@_indexes).forEach ((idxName) ->
      idxSQL = Table._idxToSQL(idxName, @_indexes[idxName], colConverts)
      substmts.push idxSQL  if idxSQL
      return
    ), this
    Object.keys(@_rels).forEach ((fkey) ->
      exTbl = @_rels[fkey]
      fkey_disp = (if (fkey of colConverts) then colConverts[fkey] else (fkey + "_id"))
      stmt = "FOREIGN KEY (" + fkey_disp + ") REFERENCES " + exTbl + "(id)"
      required = @db.table(exTbl)._referreds[@name][fkey]
      if required
        stmt += " ON UPDATE CASCADE ON DELETE CASCADE"
      else
        stmt += " ON UPDATE NO ACTION ON DELETE SET NULL"
      substmts.push stmt
      return
    ), this
    "CREATE TABLE " + bq(@name) + "(" + substmts.join(",") + ")" + ((if options.type is "mysql" and options.engine then " ENGINE=" + options.engine else "")) + ";"

  Table::_toInsertSQL = (options) ->
    options or (options = {})
    colConverts = options.columns or {}
    delete colConverts.id

    colInfos = @_colInfos
    boolTypes = @columns.reduce((ret, col) ->
      ret[col] = 1  if colInfos[col].type is Table._BOOL
      ret
    , {})
    columnNames = @columns.map((name) ->
      (if (name of colConverts) then colConverts[name] else name)
    )
    valConverts = options.values or {}
    Object.keys(valConverts).forEach (col) ->
      delete valConverts[col]  unless typeof valConverts[col] is "function"
      return

    stmt = [
      "INSERT INTO "
      bq(@name)
      "("
      columnNames.map(bq).join(",")
      ") VALUES "
    ].join(" ")
    ret = []
    cur = undefined
    i = 0
    l = @_indexes.id.length

    while i < l
      id = @_indexes.id[i]
      record = @_data[id]
      vals = @columns.map((col) ->
        v = record[col]
        v = valConverts[col](v)  if col of valConverts
        (if boolTypes[col] then (if v then 1 else 0) else (if (typeof v is "number") then v else quo(v)))
      ).join(",")
      if i % 1000 is 0
        ret.push cur  if cur
        cur =
          st: stmt
          ar: []
      cur.ar.push "(" + vals + ")"
      i++
    ret.push cur  if cur and cur.ar.length
    ret.map((cur) ->
      cur.st + cur.ar.join(",\n") + ";\n"
    ).join "\n"

  Table::_parseRaw = (info) ->
    indexes = info._indexes
    delete info._indexes

    Object.keys(info).forEach ((k) ->
      this[k] = info[k]
      return
    ), this
    Object.keys(indexes).forEach ((idxName) ->
      ids = indexes[idxName]
      isUniq = ids._unique
      @_setIndex idxName.split(","), isUniq, Array::slice.call(ids)
      return
    ), this
    this

  Table::_parseCompressed = (c) ->
    colInfoDataIdxesKeys = Table._decompressData(c[0])
    @_colInfos = colInfoDataIdxesKeys[0]
    @_data = colInfoDataIdxesKeys[1]
    @_indexes = colInfoDataIdxesKeys[2]
    @_idxKeys = colInfoDataIdxesKeys[3]
    @_classes = Table._decompressClasses(c[1])
    relsReferreds = Table._decompressRels(c[2])
    @_rels = relsReferreds[0]
    @_referreds = relsReferreds[1]
    return

  Table::_parseSchema = (colData) ->
    colData = copy(colData)
    tblName = @name
    for invalidColumn in Table.INVALID_COLUMNS
      err(invalidColumn, "is not allowed for a column name") if colData[invalidColumn]?

    metaInfos = [
      "$indexes"
      "$uniques"
      "$classes"
    ].reduce((ret, k) ->
      ret[k] = arrayize(colData[k], true)
      delete colData[k]

      ret
    , {})
    colData.id = 1
    colData.upd_at = 1
    colData.ins_at = 1
    metaInfos.$uniques.unshift "id"
    metaInfos.$indexes.unshift "upd_at", "ins_at"
    columnNames = Object.keys(colData)
    columnNames.forEach (col) ->
      (not (col.match(/[,.`"']/)?)) or err("comma, dot and quotations cannot be included in a column name.")
      return

    (columnNames.length > 3) or err("table", quo(tblName), "must contain at least one column.")
    columnNames.forEach ((colName) ->
      parsed = @__parseColumn(colName, colData[colName])
      (not (@_colInfos[parsed.name]?)) or err(quo(parsed.name), "is already registered.")
      @_colInfos[parsed.name] = parsed
      return
    ), this
    Object.keys(@_colInfos).forEach ((colName) ->
      colInfo = @_colInfos[colName]
      exTblName = colInfo.rel
      return  unless exTblName
      (colName.slice(-3) is "_id") or err("Relation columns must end with \"_id\".")
      exTable = @db.table(exTblName)
      (exTable) or err("Invalid relation: ", quo(exTblName), "is an undefined table in", quo(tblName))
      metaInfos.$indexes.push colName
      col = colName.slice(0, -3)
      @_rels[col] = exTblName
      exTable._referreds[tblName] = {}  unless exTable._referreds[tblName]
      exTable._referreds[tblName][col] = @_colInfos[colName].required
      return
    ), this
    Object.keys(metaInfos).forEach ((k) ->
      metaInfos[k] = @_normalizeIndexes(metaInfos[k])
      return
    ), this
    metaInfos.$indexes.forEach ((cols) ->
      @_setIndex cols, false
      return
    ), this
    metaInfos.$uniques.forEach ((cols) ->
      @_setIndex cols, true
      return
    ), this
    metaInfos.$classes.forEach ((cols) ->
      @_setClass cols
      return
    ), this
    @_idxKeys = Table._getIdxKeys(@_indexes)
    return

  Table::_setIndex = (cols, isUniq, ids) ->
    strCols = []
    types = cols.map((col) ->
      ret = @_colInfos[col].type
      strCols.push col  if ret is Table._STR
      ret
    , this)
    len = strCols.length
    strCols.forEach ((col) ->
      @_colInfos[col].sqltype = (if (len > 1) then Table._CHR2 else Table._CHRS)
      return
    ), this
    idxName = cols.join(",")
    return  if @_indexes[idxName]?
    @_indexes[idxName] = Table._getIndex(cols, isUniq, types, ids, @_data)
    return

  Table._getIndex = (cols, isUniq, types, ids, data) ->
    SortedList.create
      compare: generateCompare(types, cols, data)
      unique: !!isUniq
      resume: true
    , ids

  Table._getIdxKeys = (indexes) ->
    Object.keys(indexes).reduce ((ret, idxName) ->
      idxName.split(",").forEach (col) ->
        ret[col] = []  unless ret[col]
        ret[col].push idxName
        return

      ret
    ), {}

  Table::_setClass = (cols) ->
    idxname = cols.join(",")
    return  if @_classes[idxname]?
    cols.forEach ((col) ->
      (@_colInfos[col].type isnt Table._STR) or err("Cannot set class index to string columns", quo(col))
      return
    ), this
    @_classes[idxname] = cols: cols
    return

  Table::_getJoinInfos = (join) ->
    if join is true
      __j = {}
      Object.keys(@_rels).forEach (col) ->
        __j[col] = true
        return

      join = __j
    else if typeof join is "string"
      k = join
      join = {}
      join[k] = true
    joinInfos =
      1: []
      N: []
      NM: []

    Object.keys(join).forEach ((k) ->
      joinInfo =
        name: k
        req: true
        options: {}

      val = join[k]
      reltype = @_resolveTableColumn(k, joinInfo, val)
      if typeof val is "object"
        joinInfo.name = val.as  if val.as
        joinInfo.req = false  if val.outer
        joinInfo.emptyArray = true  if val.outer is "array"
        delete val.as

        delete val.outer

        delete val.explain

        [
          "limit"
          "offset"
          "select"
        ].forEach (op) ->
          if val[op]?
            joinInfo[op] = val[op]
            delete val[op]
          return

        [
          "order"
          "join"
        ].forEach (op) ->
          if val[op]?
            joinInfo.options[op] = val[op]
            delete val[op]
          return

        qs = val
        if val.where
          Object.keys(val.where).forEach (k) ->
            qs[k] = val.whare[k]
            return

          delete qs.where
        joinInfo.query = qs
      joinInfos[reltype].push joinInfo
      return
    ), this
    joinInfos

  Table::_resolveTableColumn = (k, joinInfo, val) ->
    spldot = k.split(".")
    len = spldot.length
    reltype = undefined
    (len <= 2) or err("invalid expression", quo(k))
    if len is 1
      if @_rels[k]
        joinInfo.col = k + "_id"
        joinInfo.tbl = @_rels[k]
        reltype = "1"
      else
        tbl = k
        referred = @_referreds[tbl]
        unless referred
          (typeof val is "object" and val.via?) or err("table", quo(tbl), "is not referring table", quo(@name))
          reltype = @_resolveTableColumn(val.via, joinInfo)
          delete val.via

          subval = {}
          Object.keys(val).forEach (option) ->
            return  if option is "as"
            subval[option] = val[option]
            delete val[option]  unless option is "outer"
            return

          val.join = {}
          val.join[k] = subval
          val.select = k
        else
          refCols = Object.keys(referred)
          (refCols.length is 1) or err("table", quo(tbl), "refers", quo(@name), "multiply")
          joinInfo.tbl = tbl
          joinInfo.col = refCols[0] + "_id"
          reltype = "N"
    else
      tbl = spldot[0]
      col = spldot[1]
      referred = @_referreds[tbl]
      refCols = Object.keys(referred)
      (refCols) or err("table", quo(tbl), "is not referring table", quo(@name))
      (refCols.indexOf(col) >= 0) or err("table", quo(tbl), "does not have a column", quo(col))
      joinInfo.tbl = tbl
      joinInfo.col = col + "_id"
      reltype = "N"
    reltype

  Table::_normalizeIndexes = (arr) ->
    arr.map ((def) ->
      def = arrayize(def)
      def.map ((col) ->
        col = col + "_id"  if @_rels[col]
        (@_colInfos[col] isnt `undefined`) or err(quo(col), "is unregistered column. in", quo(@name))
        col
      ), this
    ), this

  Table::__parseColumn = (colName, columnOption) ->
    colObj =
      name: colName
      type: Table._STR
      sqltype: Table._STR
      required: false
      _default: null
      rel: false

    switch columnOption
      when true
        colObj.required = true
      when "str", "text", false
        break
      when "req"
        colObj.type = Table._STR
        colObj.sqltype = Table._CHRS
        colObj.required = true
      when "not", "chars", ""
        colObj.type = Table._STR
        colObj.sqltype = Table._CHRS
      when 1
        colObj.type = Table._NUM
        colObj.sqltype = Table._INT
        colObj.required = true
      when "int", 0
        colObj.type = Table._NUM
        colObj.sqltype = Table._INT
      when "num", "float"
        colObj.type = colObj.sqltype = Table._NUM
      when 1.1
        colObj.type = colObj.sqltype = Table._NUM
      when 0.1
        colObj.type = colObj.sqltype = Table._NUM
        colObj.required = true
      when "on"
        colObj.type = colObj.sqltype = Table._BOOL
        colObj._default = true
      when "bool", "off"
        colObj.type = colObj.sqltype = Table._BOOL
        colObj._default = false
      else
        columnOption = type: columnOption  if typeof columnOption is "string"
        (columnOption and columnOption.type) or err("invalid column description.")
        switch columnOption.type
          when "text", "string", "str"
            colObj.type = colObj.sqltype = Table._STR
          when "double", "float", "number", "num"
            colObj.type = colObj.sqltype = Table._NUM
          when "boolean", "bool"
            colObj.type = colObj.sqltype = Table._BOOL
          when "int"
            colObj.type = Table._NUM
            colObj.sqltype = Table._INT
          when "chars"
            colObj.type = Table._STR
            colObj.sqltype = Table._CHRS
          else
            colObj.name += "_id"
            colObj.type = Table._NUM
            colObj.sqltype = Table._INT
            colObj.rel = columnOption.type
            columnOption.required = true  if columnOption.required is `undefined`
        if columnOption._default?
          (typeof columnOption._default is Table.TYPES[colObj.type]) or err("type of the default value", columnOption._default, "does not match", Table.TYPES[colObj.type], "in", colObj.name)
          colObj._default = columnOption._default
          colObj.sqltype = Table._CHRS  if colObj.sqltype is Table._STR
        colObj.required = !!columnOption.required  if columnOption.required
    colObj

  Table::_orderBy = (keys, order, report) ->
    return keys  unless order
    orders = objectize(order, "asc")
    Object.keys(orders).reverse().forEach ((k) ->
      orderType = orders[k]
      if @_indexes[k] and keys.length * 4 > @_indexes.id.length
        if report
          report.orders.push
            column: k
            type: orderType
            method: "index"

        idx = @_indexes[k]
        keys = hashFilter(idx, keys)
        keys = keys.reverse()  if orderType is "desc"
      else
        keys = keys.slice().sort(generateCompare(@_colInfos[k].type, k, @_data))
        if report
          report.orders.push
            column: k
            type: orderType
            method: "sort"

        keys = keys.reverse()  if orderType is "desc"
      return
    ), this
    keys

  Table::_select = (keys, cols, joins, joinCols) ->
    if typeof cols is "string"
      if cols is "id"
        return (if (keys.toArray) then keys.toArray() else keys)  if keys.length is 0 or typeof keys[0] is "number"
        return keys.map((v) ->
          Number v
        )
      if joinCols and joinCols.indexOf(cols) >= 0
        return keys.map((id) ->
          joins[id][cols]
        , this)
      (@_colInfos[cols]) or err("column", quo(cols), "is not found in table", quo(@name))
      return keys.map((id) ->
        @_data[id][cols]
      , this)
    unless cols?
      ret = keys.map((id) ->
        copy @_data[id]
      , this)
      if joins and joinCols and joinCols.length
        ret.forEach (obj) ->
          joinCols.forEach (col) ->
            obj[col] = (if (not (joins[obj.id]?)) then null else joins[obj.id][col])
            return
          return
      return ret
    err("typeof options.select", cols, "must be string, null, or array") unless Array.isArray(cols)
    inputCols = cols
    _joinCols = []
    cols = []
    inputCols.forEach ((col) ->
      if joins and joinCols and joinCols.indexOf(col) >= 0
        _joinCols.push col
      else if @_colInfos[col]
        cols.push col
      else
        err "column", quo(col), "is not found in table", quo(@name)
      return
    ), this
    ret = keys.map((id) ->
      ob = {}
      cols.forEach ((col) ->
        ob[col] = @_data[id][col]
        return
      ), this
      ob
    , this)
    if joins and _joinCols.length
      ret.forEach (obj) ->
        _joinCols.forEach (col) ->
          obj[col] = joins[obj.id][col]
          return

        return

    ret

  Table::_survive = (id, query, normalized) ->
    return id  unless query
    that = this
    query = (if (normalized) then query else Table._normalizeQuery(query))
    (if query.some((condsList) ->
      Object.keys(condsList).every (column) ->
        condsList[column].some (cond) ->
          Object.keys(cond).every (condType) ->
            Queries.noIndex[condType].call(that, column, cond[condType], [id]).length



    ) then id else null)

  Table._normalizeQuery = (query) ->
    return null  if not query or not Object.keys(query).length
    arrayize(query).map (condsList) ->
      Object.keys(condsList).reduce ((ret, column) ->
        ret[column] = arrayize(condsList[column]).map((cond) ->
          (if (cond is null) then equal: null else (if (typeof cond is "object") then cond else equal: cond))
        )
        ret
      ), {}


  Table._reportSubQuery = (report, info, reltype) ->
    subreport =
      reltype: reltype
      table: info.tbl
      join_column: info.col
      name: info.name
      outer: not info.req
      emptyArray: !!info.emptyArray

    info.options.explain = subreport
    report.subqueries.push subreport
    return

  Table._offsetLimit = (keys, offset, limit) ->
    return keys  if not offset? and not limit?
    offset = offset or 0
    end = (if limit then (limit + offset) else keys.length)
    keys.slice offset, end

  Table._buildReportObj = (obj) ->
    return null  unless obj
    obj.searches = []  unless obj.searches
    obj.subqueries = []  unless obj.subqueries
    obj.orders = []  unless obj.orders
    obj

  Object.keys(Table::).forEach (name) ->
    return  if name.charAt(0) is "_"
    method = Table::[name]
    return  unless typeof method is "function"
    JSRel::[name] = (args...)->
      tblName = args.shift()
      tbl = @table(tblName)
      (tbl) or err("invalid table name", quo(tblName))
      tbl[name].apply tbl, args

    return

  Queries =
    index: {}
    classes: {}
    noIndex: {}

  Queries.index.equal = (col, value, list) ->
    @_idxSearchByValue list, col, value, (obj, data) ->
      keys = list.keys(obj.id)
      (if keys then keys.map((k) ->
        list[k]
      ) else [])


  Queries.index.like$ = (col, value, list) ->
    @_idxSearchByValue list, col, value, ((obj, data) ->
      pos = list.bsearch(obj.id)
      key = list.key(obj.id, pos)
      results = []
      i = (if (key?) then key else pos + 1)
      len = list.length
      cur = undefined
      v = undefined
      included = false
      loop
        cur = data[list[i]]
        v = cur[col]

        if v.indexOf(value) is 0
          included = true
          results.push cur.id
        else
          included = false
        break unless ++i < len and (v <= value or included)
      results
    ), this

  Queries.index.gt = (col, value, list) ->
    return []  unless list.length
    @_idxSearchByValue list, col, value, (obj, data) ->
      i = list.bsearch(obj.id) + 1
      len = list.length
      cur = undefined
      v = undefined
      loop
        cur = data[list[i]]
        v = cur[col]
        break unless ++i < len and v <= value
      list.slice i


  Queries.index.ge = (col, value, list) ->
    return []  unless list.length
    @_idxSearchByValue list, col, value, (obj, data) ->
      pos = list.bsearch(obj.id)
      key = list.key(obj.id, pos)
      list.slice (if (key?) then key else pos + 1)


  Queries.index.lt = (col, value, list) ->
    return []  unless list.length
    @_idxSearchByValue list, col, value, (obj, data) ->
      pos = list.bsearch(obj.id)
      key = list.key(obj.id, pos)
      list.slice 0, (if (key?) then key else pos + 1)


  Queries.index.le = (col, value, list) ->
    return []  unless list.length
    @_idxSearchByValue list, col, value, (obj, data) ->
      i = list.bsearch(obj.id) + 1
      len = list.length
      cur = undefined
      v = undefined
      loop
        cur = data[list[i]]
        v = cur[col]
        break unless ++i < len and v <= value
      list.slice 0, i


  Queries.index.$in = (col, values, list) ->
    return []  unless list.length
    results = []
    arrayize(values).forEach ((value) ->
      @_idxSearchByValue list, col, value, (obj, data) ->
        k = list.key(obj.id)
        results.push list[k]  if k?
        return

      return
    ), this
    results

  Queries.noIndex.equal = (col, value, ids) ->
    ids.filter ((id) ->
      @_data[id][col] is value
    ), this

  Queries.noIndex.like$ = (col, value, ids) ->
    (@_colInfos[col].type is Table._STR) or err("Cannot use like$ search to a non-string column", col)
    ids.filter ((id) ->
      @_data[id][col].indexOf(value) is 0
    ), this

  Queries.noIndex.like = (col, value, ids) ->
    ids.filter ((id) ->
      @_data[id][col].indexOf(value) >= 0
    ), this

  Queries.noIndex.gt = (col, value, ids) ->
    ids.filter ((id) ->
      @_data[id][col] > value
    ), this

  Queries.noIndex.ge = (col, value, ids) ->
    ids.filter ((id) ->
      @_data[id][col] >= value
    ), this

  Queries.noIndex.lt = (col, value, ids) ->
    ids.filter ((id) ->
      @_data[id][col] < value
    ), this

  Queries.noIndex.le = (col, value, ids) ->
    ids.filter ((id) ->
      @_data[id][col] <= value
    ), this

  Queries.noIndex.$in = (col, values, ids) ->
    ids.filter ((id) ->
      arrayize(values).indexOf(@_data[id][col]) >= 0
    ), this

  Queries.classes.equal = (col, val, cls) ->
    (if (cls[val]) then Object.keys(cls[val]) else [])

  Queries.classes.gt = (col, val, cls) ->
    ret = []
    Object.keys(cls).forEach (v) ->
      ret = ret.concat(Object.keys(cls[v]))  if v > val
      return

    ret

  Queries.classes.ge = (col, val, cls) ->
    ret = []
    Object.keys(cls).forEach (v) ->
      ret = ret.concat(Object.keys(cls[v]))  if v >= val
      return

    ret

  Queries.classes.lt = (col, val, cls) ->
    ret = []
    Object.keys(cls).forEach (v) ->
      ret = ret.concat(Object.keys(cls[v]))  if v < val
      return

    ret

  Queries.classes.le = (col, val, cls) ->
    ret = []
    Object.keys(cls).forEach (v) ->
      ret = ret.concat(Object.keys(cls[v]))  if v <= val
      return

    ret

  Queries.classes.$in = (col, vals, cls) ->
    return Queries.classes.equal.call(this, col, vals, cls)  unless Array.isArray(vals)
    cup vals.map((v) ->
      Queries.classes.equal.call this, col, v, cls
    , this)

  ###
  generates comparison function

  @types   : data type of the column(s)
  @columns : column name(s)
  @data    : data of the column(s)
  ###
  generateCompare = (types, columns, data) ->
    types = arrayize types
    columns = arrayize columns

    if columns.length is 1
      return generateCompare[Table._NUM]  if columns[0] is "id"
      fn = generateCompare[types[0]]
      col = columns[0]
      return (id1, id2) -> fn data[id1][col], data[id2][col]

    return (id1, id2) ->
      a = data[id1]
      b = data[id2]
      for type, k in types
        col = columns[k]
        result = generateCompare[type](a[col], b[col])
        return result if result
      return 0

  # basic comparison functions
  generateCompare[Table._BOOL] = (a, b) -> if (a is b) then 0 else if a then 1 else -1
  generateCompare[Table._NUM] = SortedList.compares["number"]
  generateCompare[Table._STR] = SortedList.compares["string"]

  JSRel
