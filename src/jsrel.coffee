((root, factory) ->
  ###
  # for AMD (Asynchronous Module Definition)
  ###
  if typeof define is "function" and define.amd
    define ["sortedlist"], factory
  else if typeof module is "object" and module.exports
    module.exports = factory()
  else
    root.JSRel = factory(root.SortedList)
  return
) this, (SortedList) ->

  ######################
  # ENVIRONMENTS
  ######################
  SortedList = require("sortedlist")  unless SortedList
  isTitanium = (typeof Ti is "object" and typeof Titanium is "object" and Ti is Titanium)
  isNode = not isTitanium and (typeof module is "object" and typeof exports is "object" and module.exports is exports)
  isBrowser = (typeof localStorage is "object" and typeof sessionStorage is "object")
  storages = mock: do->
    mockData = {}
    getItem: (id) ->
      mockData[id] or null

    setItem: (id, data) ->
      mockData[id] = data
      return

    removeItem: (id) ->
      delete mockData[id]

  if isBrowser
    storages.local   = window.localStorage
    storages.session = window.sessionStorage
  if isTitanium
    fs = Ti.Filesystem
    storages.file =
      getItem: (k) ->
        file = fs.getFile(k.toString())
        if file.exists() then fs.getFile(k.toString()).read().text else null

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

  ######################
  # UTILITIES FOR DEFINING CLASSES
  ######################

  # defineGetters : define getters to object
  defineGetters = (obj, getters)->
    Object.defineProperty(obj, name, get: fn, set: noop) for name, fn of getters

  # defineConstants : define constants to object
  defineConstants = (obj, constants)->
    for name, val of constants
      Object.defineProperty(obj, name, value: val, writable: false)
      Object.freeze val if typeof val is "object"

  ######################
  # class JSRel 
  ######################
  ###
  # public
  # - id
  # - name
  # - tables : list of tables (everytime dynamically created)
  # 
  # private
  # - _storage  : storage name
  # - _autosave : boolean
  # - _tblInfos : { tableName => Table object }
  # - _hooks    : { eventName => [function, function...] }
  ###
  class JSRel
    # key: id of db, value: instance of JSRel
    @._dbInfos = {}

    ###
    # class properties
    # uniqIds: list of uniqIds
    # isNode, isTitanium, isBrowser: environment detection. boolean 
    # storage: available storages (array)
    ###
    defineGetters @,
      uniqIds: -> Object.keys @_dbInfos

    defineConstants @,
      isNode     : isNode
      isTitanium : isTitanium
      isBrowser  : isBrowser
      storages   : storages

    ###
    # constructor
    #
    # called only from JSRel.use or JSRel.$import
    # arguments
    # - uniqId   :
    # - name     :
    # - storage  :
    # - autosave :
    # - format   : format of tblData to parse (one of Raw, Schema, Compressed)
    # - tblData  :
    # - loaded   : if loaded from stored data, true
    ###
    constructor: (uniqId, name, @_storage, @_autosave, format, tblData, loaded) ->
      defineConstants @, id: uniqId, name: name

      @constructor._dbInfos[uniqId] = db: this, storage: @_storage

      @_hooks = {}
      @_tblInfos = {}
      @_loaded = !!loaded

      for tblName, colData of tblData
        @_tblInfos[tblName] = new Table(tblName, this, colData, format)

    ###
    # JSRel.use(uniqId, option)
    #
    # Creates instance if not exist. Gets previously created instance if already exists
    # - uniqId: the identifier of the instance, used for storing the data to external system(file, localStorage...)
    # - options:
    #   - storage(string) : type of external storage. one of mock, file, local, session
    #   - schema (object) : DB schema. See README.md for detailed information
    #   - reset  (boolean) : if true, create db even if previous db with the same uniqId already exists.
    #   - autosave (boolean) : if true, save at every action(unstable...)
    #   - name (string) : name of the db
    #   <private options>
    #   - __create (boolean) : throws an error if db already exists.
    ###
    @use : (uniqId, options = {}) ->
      uniqId or err "uniqId is required and must be non-zero value."
      uniqId = uniqId.toString()

      # if given uniqId already exists in memory, load it
      storedInMemory = @_dbInfos[uniqId]
      if storedInMemory?
        err "uniqId", quo(uniqId), "already exists" if options.__create
        return @_dbInfos[uniqId].db if not options or not options.reset

      #options or err "options is required."
      options.storage = options.storage or if (isNode or isTitanium) then "file" else if isBrowser then "local" else "mock"
      storage = @storages[options.storage]
      storage or err "options.storage must be one of " + Object.keys(@storages).map(quo).join(",")

      if not options.reset and dbJSONstr = storage.getItem(uniqId)
        JSRel.$import uniqId, dbJSONstr, force : false
      else
        options.schema and typeof options.schema is "object" or err "options.schema is required"
        Object.keys(options.schema).length or err "schema must contain at least one table"
        format = "Schema"
        tblData = deepCopy(options.schema)
        name = if options.name? then options.name.toString() else uniqId
        new JSRel(uniqId, name, options.storage, !!options.autosave, format, tblData)

    @createIfNotExists = @use

    ###
    # JSRel.create(uniqId, option)
    #
    # Creates instance if not exist. Throws an error if already exists
    # - uniqId: the identifier of the instance, used for storing the data to external system(file, localStorage...)
    # - options:
    #   - storage(string) : type of external storage. one of mock, file, local, session
    #   - schema (object) : DB schema. See README.md for detailed information
    #   - autosave (boolean) : if true, save at every action(unstable...)
    #   - name (string) : name of the db
    ###
    @create : (uniqId, options) ->
      options or (options = {})
      delete options.reset
      options.__create = true
      JSRel.use uniqId, options

    ###
    # JSRel.$import(uniqId, dbJSONstr, options)
    #
    # Creates instance from saved data
    # - uniqId: the identifier of the instance, used for storing the data to external system(file, localStorage...)
    # - dbJSONstr : data
    # - options:
    #   - force (boolean) : if true, overrides already-existing database.
    #   - storage(string) : type of external storage. one of mock, file, local, session
    #   - autosave (boolean) : if true, save at every action(unstable...)
    #   - name (string) : name of the db
    ###
    @$import : (uniqId, dbJSONstr, options = {}) ->
      uniqId or err "uniqId is required and must be non-zero value."
      uniqId = uniqId.toString()
      (options.force or not @_dbInfos[uniqId]?) or err "id", quo(uniqId), "already exists"
      try
        d = JSON.parse(dbJSONstr)
      catch e
        err "Invalid format given to JSRel.$import"
      for key in [ "n","s","a","f","t" ]
        d.hasOwnProperty(key) or err("Invalid Format given.")

      # trying to use given autosave, name and storage
      autosave = if options.autosave? then !!options.autosave else d.a
      name = if options.name? then options.name.toString() else d.n
      storage = if options.storage? then options.storage.toString() else d.s
      JSRel.storages[storage]?  or err "options.storage must be one of " + Object.keys(JSRel.storages).map(quo).join(",")

      new JSRel(uniqId, name, storage, autosave, d.f, d.t, true) # the last "true" means "loaded"

    # alias
    @import = JSRel.$import

    #######
    ##
    ## JSRel instance properties (getter)
    ##
    #######
    defineGetters @::,
      loaded : -> @_loaded
      created: -> !@_loaded

      storage: -> JSRel.storages[@_storage]

      tables : -> Object.keys @_tblInfos

      schema : ->
        tableDescriptions = {}
        for tableName, tblInfo of @_tblInfos
          table = @_tblInfos[tableName]
          columnDescriptions = {}
          for colName in table.columns
            continue if Table.AUTO_ADDED_COLUMNS[colName] #id, ins_at, upd_at
            colInfo = table._colInfos[colName]
            columnDescriptions[colName] =
              type    : Table.TYPES[colInfo.type]
              required: colInfo.required
              _default: colInfo._default

          columnDescriptions.$indexes = []
          columnDescriptions.$uniques = []
          for col, index of table._indexes
            continue if Table.AUTO_ADDED_COLUMNS[colName]
            columnDescriptions[(if index._unique then "$uniques" else "$indexes")].push col.split(",")

          columnDescriptions.$classes = Object.keys(table._classes).map((col) -> col.split ",")

          for metaKey in Table.COLUMN_META_KEYS
            delete columnDescriptions[metaKey]  if columnDescriptions[metaKey].length is 0

          tableDescriptions[tableName] = columnDescriptions
        tableDescriptions

    #######
    ##
    ## JSRel instance methods
    ##
    #######

    ###
    # JSRel#table(tableName)
    # gets table ofject by its name
    ###
    table : (tableName) ->
      @_tblInfos[tableName]

    ###
    # JSRel#save(noCompress)
    ###
    save : (noCompress) ->
      @_hooks["save:start"] and @_emit "save:start", @origin()
      data = @$export(noCompress)
      @storage.setItem @id, data
      @_emit "save:end", data
      this

    ###
    # JSRel#origin()
    ###
    origin : -> @storage.getItem @id

    ###
    # JSRel#$export(noCompress)
    ###
    $export : (noCompress) ->
      ret =
        n: @name
        s: @_storage
        a: @_autosave

      ret.t = if noCompress then @_tblInfos else do(tblData = @_tblInfos)->
        t = {}
        for tblName, table of tblData
          t[tblName] = table._compress()
        return t

      ret.f = if (noCompress) then "Raw" else "Compressed"
      JSON.stringify ret

    # alias for $export
    export : (noCompress)-> @$export noCompress

    ###
    # JSRel#toSQL(options)
    ###
    toSQL : (options = type: "mysql", engine: "InnoDB") ->
       if options.rails
         n2s = (n) -> ("000" + n).match /..$/
         datetime = (v) ->
           t = new Date(v)
           t.getFullYear() + "-" +
           n2s(t.getMonth() + 1) + "-" +
           n2s(t.getDate()) + " " +
           n2s(t.getHours()) + ":" +
           n2s(t.getMinutes()) + ":" +
           n2s(t.getSeconds())
 
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

    ###
    # JSRel#on()
    ###
    on : (evtname, fn, options = {}) ->
      @_hooks[evtname] = []  unless @_hooks[evtname]
      @_hooks[evtname][(if options.unshift then "unshift" else "push")] fn
      return

    ###
    # JSRel#off()
    ###
    off : (evtname, fn) ->
      return unless @_hooks[evtname]
      return @_hooks[evtname] = null  unless fn?
      @_hooks[evtname] = @_hooks[evtname].filter((f) -> fn isnt f)
      return

    ###
    # JSRel#drop()
    ###
    drop : (tblNames...)->
      nonRequiredReferringTables = {}
      for tblName in tblNames
        table = @_tblInfos[tblName]
        table or err "unknown table name", quo(tblName), "in jsrel#drop"
        for refTblName, refTables of table._referreds
          for col, colInfo of refTables
            unless colInfo
              nonRequiredReferringTables[refTblName] = col
            else if refTblName not in tblNames
              err("table ", quo(tblName), "has its required-referring table", quo(refTblName), ", try jsrel#drop('" + tblName + "', '" + refTblName + "')")

      for tblName in tblNames
        table = @_tblInfos[tblName]
        for relname, relTblName of table._rels
          continue if relTblName in tblNames # skip if related table is already in deletion list
          relTable = @_tblInfos[relTblName]
          delete relTable._referreds[tblName]
        for prop in ["_colInfos", "_indexes", "_idxKeys", "_classes", "_data", "_rels", "_referreds"]
          delete table[prop]
        delete @_tblInfos[tblName]

      for refTblName, col of nonRequiredReferringTables
        refTable = @_tblInfos[refTblName]
        for id, record of refTable._data
          record[col + "_id"] = null
      return

    ####
    # private instance methods
    ####

    ###
    # JSRel#_emit()
    ###
    _emit : (args...)->
      evtname = args.shift()
      return unless Array.isArray @_hooks[evtname]
      for fn in @_hooks[evtname]
        fn.apply this, args
      return

  ######################
  # class Table
  ######################
  ###
  # public
  # - columns   : list of columns
  # - name      : table name
  # - db        : id of the parent JSRel (externally set)
  # 
  # private
  # - _colInfos  : { colName => column Info object }
  # - _indexes   : { columns => sorted list }
  # - _idxKeys   : { column  => list of idx column sets}
  # - _classes   : { columns => classes hash object}
  # - _data      : { id      => record }
  # - _rels      : { column  => related table name }
  # - _referreds : { referring table name => { column => required or not} } (externally set)
  ###
  class Table

    ###
    # class properties
    ###
    defineConstants @,
      _BOOL : 1
      _NUM  : 2
      _STR  : 3
      _INT  : 4
      _CHRS : 5
      _CHR2 : 6
      TYPES:
        1: "boolean"
        2: "number"
        3: "string"
        4: "number"
        5: "string"
        6: "string"
      TYPE_SQLS:
        1: "tinyint(1)"
        2: "double"
        3: "text"
        4: "int"
        5: "varchar(255)"
        6: "varchar(160)"
      INVALID_COLUMNS:
        [ "id", "ins_at", "upd_at"
          "on", "off"
          "str", "num", "bool", "int", "float", "text", "chars", "double", "string", "number", "boolean"
          "order", "limit", "offset", "join", "where", "as", "select", "explain"
        ]
      COLKEYS: [ "name", "type", "required", "_default", "rel", "sqltype" ]
      COLUMN_META_KEYS: ["$indexes", "$uniques", "$classes"]
      AUTO_ADDED_COLUMNS: id: true, ins_at: true, upd_at: true
      NOINDEX_MIN_LIMIT: 100
      ID_TEMP: 0
      CLASS_EXISTING_VALUE: 1

    ###
    # constructor
    # 
    # arguments
    # name    : (string) table name
    # db      : (JSRel)
    # colData : table information
    # format  : format of tblData to parse (one of Raw, Schema, Compressed)
    # 
    ###
    constructor: (name, db, colData, format) ->
      defineConstants @, name: name, db: db

      @_colInfos = {}
      @_data = {}
      @_indexes = {}
      @_idxKeys = {}
      @_classes = {}
      @_rels = {}
      @_referreds = {}

      (typeof @["_parse" + format] is "function") or err("unknown format", quo(format), "given in", quo(@db.id))
      @["_parse" + format] colData

      columns = Object.keys(@_colInfos).sort()
      colOrder = {}
      colOrder[col] = k for col, k in columns
      defineConstants(@, columns: columns, colOrder: colOrder)

    #######
    ##
    ## Table instance methods
    ##
    #######

    ###
    # Table#ins()
    ###
    ins : (argObj, options = {}) ->
      err "You must pass object to table.ins()." unless (argObj and typeof argObj is "object")
      @_convertRelObj argObj

      # id, ins_at, upd_at are removed unless options.force
      unless options.force
        delete argObj[col] for col of Table.AUTO_ADDED_COLUMNS
      else
        argObj[col] = Number(argObj[col]) for col of Table.AUTO_ADDED_COLUMNS when col of argObj

      insObj = {}
      for col in @columns
        insObj[col] = argObj[col]
        @_cast col, insObj

      # checking relation tables' id
      for col, relTblName of @_rels
        idcol = col + "_id"
        exId = insObj[idcol]
        relTable = @db.table(relTblName)
        required = @_colInfos[idcol].required
        continue if not required and not exId?
        exObj = relTable.one(exId)

        if not required and not exObj?
          insObj[idcol] = null
        else if exObj is null
          err "invalid external id", quo(idcol), ":", exId

      # setting id, ins_at, upd_at
      if insObj.id?
        err("the given id \"", insObj.id, "\" already exists.") if @_data[insObj.id]?
        err("id cannot be", Table.ID_TEMP) if insObj.id is Table.ID_TEMP
      else
        insObj.id = @_getNewId()
      insObj.ins_at = new Date().getTime()  unless insObj.ins_at?
      insObj.upd_at = insObj.ins_at  unless insObj.upd_at?

      @_data[insObj.id] = insObj

      # inserting indexes, classes
      try
        @_checkUnique idxName, insObj for idxName of @_indexes
      catch e
        delete @_data[insObj.id]
        throw e
        return null

      sortedList.insert insObj.id for idxName, sortedList of @_indexes

      for columns, cls of @_classes
        values = columns.split(",").map((col) -> insObj[col]).join(",")
        cls[values] = {}  unless cls[values]
        cls[values][insObj.id] = Table.CLASS_EXISTING_VALUE

      # firing event (FOR PERFORMANCE, existing check @db._hooks runs before emitting)
      @db._hooks["ins"] and @db._emit "ins", @name, insObj
      @db._hooks["ins:" + @name] and @db._emit "ins:" + @name, insObj

      # inserting relations
      for exTblName, referred of @_referreds
        cols = Object.keys referred
        insertObjs = {}
        if cols.length is 1
          relatedObjs = argObj[exTblName] or argObj[exTblName + "." + cols[0]]
          (insertObjs[cols[0]] = if Array.isArray relatedObjs then relatedObjs else [relatedObjs]) if relatedObjs
        else
          for col in cols
            relatedObjs = argObj[exTblName + "." + col]
            (insertObjs[col] = if Array.isArray relatedObjs then relatedObjs else [relatedObjs]) if relatedObjs

        for col, relatedObjs of insertObjs
          exTable = @db.table(exTblName)
          for relObj in relatedObjs
            relObj[col + "_id"] = insObj.id
            exTable.ins relObj

      # autosave, returns copy
      @db.save()  if @db._autosave
      copy insObj

    ###
    # Table#upd()
    ###
    upd : (argObj, options = {}) ->
      err "id is not found in the given object." if argObj is null or argObj.id is null or argObj.id is Table.ID_TEMP #TODO update without id
      argObj.id = Number(argObj.id) # TODO do not modify argument object
      oldObj = @_data[argObj.id]
      err "Cannot update. Object not found in table", @name, "with given id", argObj.id if oldObj is null

      # delete timestamp (prevent manual update)
      unless options.force
        delete argObj.ins_at
        delete argObj.upd_at
      else
        argObj.ins_at = Number(argObj.ins_at)  if "ins_at" of argObj
        argObj.upd_at = new Date().getTime()

      # create new update object and decide which columns to update
      @_convertRelObj argObj
      updObj = id: argObj.id
      updCols = []
      for col in @columns
        if argObj.hasOwnProperty(col)
          updVal = argObj[col]
          updObj[col] = updVal
          updCols.push col  if updVal isnt oldObj[col]
          @_cast col, argObj
        else
          updObj[col] = oldObj[col]

      # udpate table with relation
      for updCol in updCols
        relTblName = @_rels[updCol]
        continue unless relTblName
        idcol = updCol + "_id"
        if idcol of updObj
          exId = updObj[idcol]
          required = @_colInfos[idcol].required
          continue if not required and not exId?
          exObj = @db.one(relTblName, exId)
          if not required and not exObj?
            updObj[idcol] = null
          else if exObj is null
            err "invalid external id", quo(idcol), ":", exId

      ## udpate indexes, classes
      # removing old index
      # TODO don't remove index when the key is id
      updIndexPoses = {}
      for updCol in updCols
        idxNames = @_idxKeys[updCol]
        continue unless idxNames
        for idxName in idxNames
          list = @_indexes[idxName]
          # getting old position and remove it
          for position in list.keys(updObj.id)
            if list[position] is updObj.id
              updIndexPoses[idxName] = position
              list.remove position
              break

      @_data[argObj.id] = updObj

      # checking unique
      try
        for updCol in updCols
          idxNames = @_idxKeys[updCol]
          continue unless idxNames
          @_checkUnique idxName, updObj for idxName in idxNames
      # rollbacking
      catch e
        @_data[argObj.id] = oldObj
        @_indexes[idxName].insert oldObj.id for idxName of updIndexPoses
        throw e
      # update indexes
      @_indexes[idxName].insert argObj.id for idxName of updIndexPoses

      # update classes
      for columns, cls of @_classes
        cols = columns.split(",")
        toUpdate = false
        toUpdate = true for clsCol in cols when clsCol in updCols
        continue unless toUpdate
        oldval = cols.map((col) -> oldObj[col]).join(",")
        newval = cols.map((col) -> updObj[col]).join(",")
        delete cls[oldval][updObj.id]
        delete cls[oldval] if Object.keys(cls[oldval]).length is 0
        cls[newval] = {}  unless cls[newval]?
        cls[newval][updObj.id] = Table.CLASS_EXISTING_VALUE

      # firing event (FOR PERFORMANCE, existing check @db._hooks runs before emitting)
      @db._hooks["upd"] and @db._emit "upd", @name, updObj, oldObj, updCols
      @db._hooks["upd:" + @name] and @db._emit "upd:" + @name, updObj, oldObj, updCols

      # update related objects
      for exTblName, referred of @_referreds
        cols = Object.keys referred
        updateObjs = {}
        if cols.length is 1
          relatedObjs = argObj[exTblName] or argObj[exTblName + "." + cols[0]]
          (updateObjs[cols[0]] = if Array.isArray relatedObjs then relatedObjs else [relatedObjs]) if relatedObjs
        else
          for col in cols
            relatedObjs = argObj[exTblName + "." + col]
            (updateObjs[col] = if Array.isArray relatedObjs then relatedObjs else [relatedObjs]) if relatedObjs

        for col, relatedObjs of updateObjs
          # related objects with id
          idhash = {}
          for relatedObj in relatedObjs
            idhash[relatedObj.id] = relatedObj if relatedObj.id

          query = {}
          query[col + "_id"] = updObj.id
          exTable = @db.table(exTblName)
          oldIds = exTable.find(query, select: "id")

          # delte related objects in past unless options.append
          unless options.append
            exTable.del oldId  for oldId in oldIds when not idhash[oldId]

          # update related objects if id exists
          exTable.upd idhash[oldId] for oldId in oldIds when idhash[oldId]

          # insert new related objects if id is not set
          for relatedObj in relatedObjs
            continue if relatedObj.id
            relatedObj[col + "_id"] = updObj.id
            exTable.ins relatedObj

      @db.save()  if @db._autosave
      updObj

    ###
    # Table#upd()
    ###
    find : (query, options = {}, _priv = {}) ->
      report = Table._buildReportObj(options.explain)
      keys = @_indexes.id
      query = (if (_priv.normalized) then query else Table._normalizeQuery(query, @_rels))
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
      else report.searches.push searchType: "none" if report

      # join tables
      joins = null
      joinCols = null
      if options.join
        joinInfos = @_getJoinInfos(options.join)
        joins = {} # key: id of the main object, value: joining_name => data(array) to join
        joinCols = []
        reqCols = []

        # join 1:N-related tables
        for info in joinInfos.N
          report and Table._reportSubQuery(report, info, "1:N")
          idcol = info.col
          name = info.name
          tblObj = @db.table(info.tbl)
          joinCols.push name
          reqCols.push name if info.req
          if info.emptyArray
            for id in keys
              joins[id] = {} unless joins[id]
              joins[id][name] = []
  
          keys = keys.toArray() unless Array.isArray keys
          info.query = {} unless info.query
          info.query[idcol] = $in: keys
          for result in tblObj.find(info.query, info.options)
            orig_id = result[idcol] # id of the main object
            joins[orig_id] = {} unless joins[orig_id]
            joins[orig_id][name] = [] unless joins[orig_id][name]
            joins[orig_id][name].push result
  
          if info.offset? or info.limit?
            for id, value of joins
              arr = value[name]
              value[name] = Table._offsetLimit(arr, info.offset, info.limit) if arr
  
          if info.select
            if typeof info.select is "string"
              for id, value of joins
                value[name] = value[name].map (v) -> v[info.select]
            else
              (Array.isArray(info.select)) or err("typeof options.select must be one of string, null, array")
              for id, value of joins
                arr = value[name]
                if arr
                  value[name] = value[name].map (v) ->
                    ret = {}
                    for col in info.select
                      ret[col] = v[col]
                    return ret
  
        # join N:1-related tables
        for info in joinInfos["1"]
          report and Table._reportSubQuery(report, info, "N:1")
          idcol = info.col
          name = info.name
          tblObj = @db.table(info.tbl)
          q = Table._normalizeQuery(info.query, @_rels)
          joinCols.push name
          reqCols.push name if info.req
          for id in keys
            exId = tblObj._survive(@_data[id][idcol], q, true)
            continue unless exId?
            joins[id] = {}  unless joins[id]
            joins[id][name] = tblObj._data[exId]

        # actual joining
        keys = keys.filter (id) ->
          joinColObj = joins[id]
          joinColObj = {}  unless joinColObj
          reqCols.every (col) ->
            joinColObj[col]

      keys = @_orderBy(keys, options.order, report) if options.order?
      keys = Table._offsetLimit(keys, options.offset, options.limit) if options.offset? or options.limit?
      res = @_select(keys, options.select, joins, joinCols)
      return res unless options.groupBy
      ret = {}
      keyColumn = (if options.groupBy is true then "id" else options.key)
      ret[item[keyColumn]] = item for item in res
      return ret

  JSRel.Table = Table
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
        (cls[val][obj.id] is Table.CLASS_EXISTING_VALUE) or err("deleting object is not in classes.", quo(obj.id), "in table", quo(@name))
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
    ret = (if (searchType is "noIndex" or not ids) then result else conjunction(ids, result))
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
    ob = if nocopy then obj else copy obj
    ob.id = Table.ID_TEMP unless ob.id?
    @_data[Table.ID_TEMP] = ob
    ret = fn.call(@, ob, @_data)
    delete @_data[Table.ID_TEMP]
    return ret

  Table::_idxSearchByValue = (list, col, value, fn) ->
    obj = {}
    obj[col] = value
    @_idxSearch list, obj, fn, true

  Table::_convertRelObj = (obj) ->
    Object.keys(@_rels).forEach (col) ->
      #return if obj[col + "_id"]?
      if obj[col] and obj[col].id?
        obj[col + "_id"] = obj[col].id
        delete obj[col]
      return

    obj

  Table::_cast = (colName, obj) ->
    val = obj[colName]
    return  if Table.AUTO_ADDED_COLUMNS[colName] and not val?
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

    metaInfos = Table.COLUMN_META_KEYS.reduce((ret, k) ->
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

  ###
  # parse join options from find()
  # returns canonical information of join (joinInfos)
  # joinInfos: 
  #   1: array of joinInfo (N:1 relation)
  #   N: array of joinInfo (1:N relation)
  #
  # joinInfo:
  #   name:
  #   req:
  #   emptyArray:
  #   limit:
  #   offset:
  #   select:
  #   query:   the first argument for find()
  #   options: the second argument for find()
  ###
  Table::_getJoinInfos = (joinOptions) ->
    if joinOptions is true
      joinOptions = {}
      joinOptions[col] = true for col, tblname of @_rels

    else if typeof joinOptions is "string"
      k = joinOptions
      joinOptions = {}
      joinOptions[k] = true
    joinInfos =
      1: []
      N: []

    for tbl_col, options of joinOptions
      joinInfo = @_resolveTableColumn(tbl_col, options) # tbl, col and reltype is set
      joinInfo.options = {}

      if typeof options is "object"
        joinInfo.name = if options.as then options.as else tbl_col
        joinInfo.req = !options.outer
        joinInfo.emptyArray = true if options.outer is "array"
        delete options.as
        delete options.outer
        delete options.explain

        for op in [ "limit", "offset", "select"]
          if options[op]?
            joinInfo[op] = options[op]
            delete options[op]

        for op in ["order", "join"]
          if options[op]?
            joinInfo.options[op] = options[op]
            delete options[op]

        query = options
        if options.where
          query[k] = v for k, v of options.where
          delete query.where
        joinInfo.query = query
      else
        joinInfo.name = tbl_col
        joinInfo.req = true

      joinInfos[joinInfo.reltype].push joinInfo
    return joinInfos

  ###
  # resolve table name and column name from given join option
  # tbl_col <string>: table name or column name of related table.
  #                   Format of "tablename.columename" is allowed to specify both precisely
  # returns tableColumn (tbl: table, col: column, reltype : "1" or "N", "1" means N:1 relation, "N" means 1:N (or N:M) relation)
  ###
  Table::_resolveTableColumn = (tbl_col, options) ->
    tbl_col = tbl_col.split(".")
    len = tbl_col.length
    (len <= 2) or err(quo(tbl_col), "is invalid expression", quo(k))

    if len is 1
      if @_rels[tbl_col[0]] # if given tbl_col is one of the name of N:1-related column
        col = tbl_col[0]
        tableColumn =
          col : col + "_id"
          tbl : @_rels[col]
          reltype : "1"

      else # 1:N or N:M
        tbl = tbl_col[0]
        referred = @_referreds[tbl]

        if referred # 1:N
          refCols = Object.keys(referred)
          (refCols.length is 1) or err("table", quo(tbl), "refers", quo(@name), "multiply. You can specify table and column like", quo("table_name.column_name"))
          tableColumn =
            tbl : tbl
            col : refCols[0] + "_id"
            reltype : "N"

        else # N:M via "via"
          (typeof options is "object" and options.via?) or err("table", quo(tbl), "is not referring table", quo(@name))
          tableColumn = @_resolveTableColumn(options.via) # first, joins 1:N table
          delete options.via

          # modify joinOptions so as to nest sub-joining info
          subJoinInfo = {}
          for option, value of options
            continue if option is "as"
            continue if option is "outer"
            subJoinInfo[option] = value
            delete options[option]

          options.join = {} unless options.join
          options.join[tbl] = subJoinInfo
          options.select = tbl

    else # 1:N-related table and column, expressed in "tablename.columnname"
      [tbl, col] = tbl_col
      referred = @_referreds[tbl]
      refCols = Object.keys(referred)
      (refCols) or err("table", quo(tbl), "is not referring table", quo(@name))
      (refCols.indexOf(col) >= 0) or err("table", quo(tbl), "does not have a column", quo(col))
      tableColumn =
        tbl : tbl
        col : col + "_id"
        reltype : "N"
    return tableColumn

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
        keys = conjunction(idx, keys)
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
        return keys.map Number
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

  Table._normalizeQuery = (query, rels) ->
    return null if not query or not Object.keys(query).length
    arrayize(query).map (condsList) ->
      Object.keys(condsList).reduce ((ret, column) ->
        conds = condsList[column]
        if rels[column]
          conds = condsList[column].id
          column += "_id"
        ret[column] = arrayize(conds).map((cond) ->
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
      return unless keys then [] else keys.map (k) -> list[k]


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
    for value in arrayize values
      @_idxSearchByValue list, col, value, (obj, data) ->
        keys = list.keys(obj.id)
        results.push list[k] for k in keys if keys
    return results

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

  ######################
  # UTILITY FUNCTIONS
  ######################

  # no operation
  noop = ->

  # throws error
  err = (args...)->
    args.push "(undocumented error)" if args.length is 0
    args.unshift "[JSRel]"
    throw new Error(args.join(" "))
  
  ###
  shallowly copies the given object
  ###
  copy = (obj) ->
    ret = {}
    for attr of obj
      ret[attr] = obj[attr]  if obj.hasOwnProperty(attr)
    ret
  
  ###
  deeply copies the given value
  ###
  deepCopy = (val) ->
    return val.map(deepCopy)  if Array.isArray(val)
    return val if typeof val isnt "object" or val is null or val is `undefined`
    ret = {}
    for attr of val
      ret[attr] = deepCopy val[attr] if val.hasOwnProperty attr
    return ret

  # makes elements of array unique 
  unique = (arr) ->
    o = {}
    arr.filter (i) -> if i of o then false else o[i] = true

  ###
  logical sum
  @params arr: <Array<Array>>
  ###
  cup = (arr) -> unique Array::concat.apply([], arr)

  # quote v
  quo = (v) -> "\"" + v.toString().split("\"").join("\\\"") + "\""
 
  # backquote v
  bq = (v) -> "`" + v + "`"
  
  # arrayize if not
  arrayize = (v, empty) -> if Array.isArray(v) then v else if (empty and not v?) then [] else [v]
  
  # objectize if string
  objectize = (k, v) ->
    return k  unless typeof k is "string"
    obj = {}
    obj[k] = v
    return obj
  
  # logical conjunction of arr1<Array> and arr2 <Array>
  # arr1.length should be much larger than arr2.length
  conjunction = (arr1, arr2) ->
    hash = {}
    i = 0
    l = arr2.length
    while i < l
      hash[arr2[i]] = true
      i++
    ret = []
    j = 0
    l = arr1.length
    while j < l
      v = arr1[j]
      ret.push(v) if hash[v]?
      j++
    ret

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

  # exporting
  return JSRel
