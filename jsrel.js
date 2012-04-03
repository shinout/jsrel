var JSRel = (function(isNode, isBrowser, SortedList) {

/**********
 * initialization
 *********/

  // load modules (Node.js)
  if (isNode) SortedList = require('sortedlist');

  // storages
  var storages = { mock : { getItem: noop, setItem: noop, removeItem: noop } };
  if (isBrowser) {
    storages.local   = window.localStorage;
    storages.session = window.sessionStorage;
  }
  if (isNode) {
    var fs = require('fs');
    storages.file = {
      getItem : function (k) {
        try { return fs.readFileSync(k, 'utf8') } 
        catch (e) { return null }
      },
      setItem : function (k, v) { return fs.writeFileSync(k, v.toString(), 'utf8') },
      removeItem : function (k) { return fs.unlinkSync(k) }
    };
  }

/**********
 * JSRel static variables
 *********/

 /** 
  * arguments
  *  - uniqId   : 
  *  - name     : 
  *  - storage  : 
  *  - autosave : 
  *  - format   : 
  *  - tblInfos : 
  *
  * public
  *  - id
  *  - name
  *  - tables : list of tables
  *
  * private
  *  - _storage  : storage name
  *  - _autosave : boolean
  *  - _tblInfos : { tableName => Table object }
  **/
  var JSRel = function JSRel(uniqId, name, storage, autosave, format, tblInfos) {
    Object.defineProperty(this, 'id', { value : uniqId, writable: false });
    Object.defineProperty(this, 'name', { value : name, writable: false });
    this._storage  = storage;
    this._autosave = autosave;
    this.constructor._dbInfos[uniqId] = {db: this, storage: storage};

    var tables = Object.keys(tblInfos);

    this._tblInfos = {};

    tables.forEach(function(tblName) {
      this._tblInfos[tblName] = new Table(tblName, this, format, tblInfos[tblName]);
    }, this); 
    var tableRels = [];
    tables.forEach(function(tblName) {
      var tbl = this.table(tblName);
      Object.keys(tbl._referreds).forEach(function(exTable) {
        if (tbl._referreds[exTable]) tableRels.push([tblName, exTable]);
      });
    }, this);
    Object.defineProperty(this, "tables", {value: tsort(tableRels), writable: false});
  };

  JSRel._dbInfos = {};

  Object.defineProperties(JSRel, {
    uniqIds : {
      get: function() { return Object.keys(this._dbInfos) },
      set: noop
    },
    isNode :    { value: isNode, writable : false },
    isBrowser : { value: isBrowser, writable : false },
    storages :  { value: storages, writable : false },
  });

  /**
   * JSRel.use(uniqId, options)
   * Creates an instance
   **/
  JSRel.use = function(uniqId, options) {
    (uniqId) || err('uniqId is required and must be non-zero value.');
    uniqId = uniqId.toString();
    if (this._dbInfos[uniqId] && (!options || !options.reset)) return this._dbInfos[uniqId].db;

    (options) || err('options is required.');

    if (!options.storage) options.storage = (isNode) ? "file" : (isBrowser) ? "local" : "mock";
    var storage = this.storages[options.storage];
    (storage) || err('options.storage must be one of ["' + Object.keys(this.storages).join('", "') + '"]');

    var format, tblInfos;

    var dbstr = storage.getItem(uniqId);
    if (dbstr && !options.reset) {
      try { var dbinfo = JSON.parse(dbstr) }
      catch (e) { throw new Error('Invalid JSON given. in db', quo(uniqId)) }
      format = dbinfo.f;
      tblInfos = dbinfo.t;
      (format) || err("format is not given in stringified data in db", uniqId);
    }
    else {
      (options.schema && typeof options.schema == 'object') || err('options.schema is required');
      (Object.keys(options.schema).length) || err('schema must contain at least one table');
      format = "Schema";
      tblInfos = options.schema;
    }
    var name = (options.name != null) ? options.name.toString() : uniqId;

    return new JSRel(uniqId, name, options.storage, !!options.autosave, format, tblInfos);
  };

  /**
   * JSRel.$import(uniqId, str, options)
   **/
  JSRel.$import = function(uniqId, str, options) {
    options || (options = {});
    (uniqId) || err('uniqId is required and must be non-zero value.');
    uniqId = uniqId.toString();
    (options.force || this._dbInfos[uniqId] == null) || err("id", quo(uniqId), "already exists");
    // TODO UNIQID CHECK
    try { var d = JSON.parse(str) }
    catch (e) { throw new Error('Invalid format given.') }
    ["n", "s", "a", "f", "t"].forEach(function(k) {
      (d.hasOwnProperty(k)) || err("Invalid Format given.");
    });
    return new JSRel(uniqId, d.n, d.s, d.a, d.f, d.t);
  };

  /**
   * free the db
   **/
  JSRel.free = function(uniqId) {
    delete this._dbInfos[uniqId];
  };

/**********
 * JSRel private methods
 *********/
  JSRel._compress = function(tblInfos) {
    return Object.keys(tblInfos).reduce(function(ret, tblName) {
      ret[tblName] = tblInfos[tblName]._compress();
      return ret;
    }, {});
  };


/**********
 * JSRel instance variables
 *********/

  Object.defineProperty(JSRel.prototype, 'storage', {
    get: function() { return JSRel.storages[this._storage] },
    set: noop 
  });

  /**
   * jsrel.table(tableName)
   **/
  JSRel.prototype.table = function(tableName) {
    return this._tblInfos[tableName];
  };

  /**
   * jsrel.save(compress)
   **/
  JSRel.prototype.save = function(noCompress) {
    this.storage.setItem(this.id, this.$export(noCompress));
    return this;
  };

  /**
   * jsrel.$export(noCompress)
   **/
  JSRel.prototype.$export = function(noCompress) {
    var ret = { n: this.name, s: this._storage, a: this._autosave };
    ret.t = (noCompress) ? this._tblInfos : JSRel._compress(this._tblInfos);
    ret.f = (noCompress) ? "Raw" : "Compressed";
    return JSON.stringify(ret);
  };

  /**
   * jsrel.toSQL()
   **/
  JSRel.prototype.toSQL = function(options) {
    options || (options = {type: "mysql", engine: 'InnoDB'});
    if (options.rails) {
      var datetime = function(v) {
        function n2s(n){ return ("000"+n).match(/..$/) }
        var t = new Date(v);
        return t.getFullYear()+"-"+n2s(t.getMonth()+1)+"-"+n2s(t.getDate())+" "
        +n2s(t.getHours())+":"+n2s(t.getMinutes())+":"+n2s(t.getSeconds());
      };
      (options.columns) || (options.columns = {});
      (options.values) || (options.values = {});
      options.columns.upd_at = "updated_at";
      options.columns.ins_at = "created_at";
      options.values.upd_at = datetime;
      options.values.ins_at = datetime;
    }

    var ret = [];

    if (!options.noschema && !options.nodrop) ret.push(this.tables.map(function(tbl) {
      return this.table(tbl)._toDropSQL(options);
    }, this).reverse().join("\n"));
   
    if (!options.noschema) ret.push(this.tables.map(function(tbl) {
      return this.table(tbl)._toCreateSQL(options);
    }, this).join("\n"));

    if (!options.nodata) ret.push( this.tables.map(function(tbl) {
      return this.table(tbl)._toInsertSQL(options);
    }, this).join("\n"));

    return ret.join('\n');
  };

  /**
   * jsrel.close()
   **/
  JSRel.prototype.close = function() {
    // unimplemented
  };

/**********
 * JSRel.Table instance variables
 *********/

  /**
   * Table
   *
   * arguments
   *   name    : (string) table name
   *   db      : (JSRel) 
   *   format  : (string) type of tblInfo
   *   tblInfo : (object) table info to create data from
   *
   * public
   *  - columns : list of columns
   *  - name    : table name
   *  - db      : id of the parent JSRel (externally set)
   *
   * private
   *  - _colInfos  : { colName => column Info object }
   *  - _indexes   : { columns => sorted list }
   *  - _idxKeys   : { column  => list of idx column sets}
   *  - _classes   : { columns => classes hash object}
   *  - _data      : { id      => record }
   *  - _rels      : { RelName => related table name }
   *  - _referreds : { referring table name => { column => required or not} } (externally set)
   **/
  var Table = function Table(name, db, format, tblInfo) {
    Object.defineProperty(this, 'name', { value : name, writable: false });
    Object.defineProperty(this, 'db',   { value : db, writable: false });
    // Private values. They can be directly input and replaced.
    this._colInfos  = {};
    this._data      = {};
    this._indexes   = {};
    this._idxKeys   = {};
    this._classes   = {};
    this._rels      = {};
    this._referreds = {};

    var parseMethod = "_parse" + format;
    (typeof this[parseMethod] == "function") || err("unknown format", quo(format), "given in", quo(this.db.id));
    this[parseMethod](tblInfo);
    Object.defineProperty(this, 'columns', { value : Object.keys(this._colInfos), writable: false });
  };

  JSRel.Table = Table;

  Object.defineProperties(Table, {
    _BOOL   : { value : 1, writable: false },
    _NUM    : { value : 2, writable: false },
    _STR    : { value : 3, writable: false },
    _INT    : { value : 4, writable: false },
    _CHRS   : { value : 5, writable: false },
    _CHR2   : { value : 6, writable: false },
    TYPES   : { value : {1: "boolean", 2: "number", 3: "string", 4: "number", 5: "string", 6: "string"}, writable: false },
    ID_TEMP : { value : 0, writable: false },
    INVALID_COLUMNS: { value: 
      [ 'id', 'ins_at', 'upd_at',
        'on', 'off', 'str', 'num', 'bool', 'int', 'float', 'text', 'chars', 'double', 'string', 'number', 'boolean',
        'order', 'limit', 'offset', 'join', "where", "as", "select", "explain"
      ], writable: false },
    AUTO: { value: { id: true, ins_at: true, upd_at: true }, writable : false },
    NOINDEX_MIN_LIMIT : { value: 100, writable: false },
    COLKEYS : { value : [ 'name', 'type', 'required', '_default', 'rel', 'sqltype' ], writable: false },
    TYPE_SQLS : { value : { 1: 'tinyint(1)', 2: 'double', 3: 'text', 4: 'int', 5: 'varchar(255)', 6: 'varchar(160)' }, writable: false }
  });

  /**
   * table.ins(obj)
   **/
  Table.prototype.ins = function(obj, options) {
    options || (options = {});
    (obj && typeof obj == "object") || err("You must pass object to table.ins().");
    // converting related object
    this._convertRelObj(obj);

    // if non-forced insertion, auto-columns are removed.
    if (!options.force) {
      delete obj.id;
      delete obj.ins_at;
      delete obj.upd_at;
    }
    else {
      ["id", "ins_at", "upd_at"].forEach(function(col) { if (col in obj) obj[col] = Number(obj[col]) });
    }

    // cast type if possible. Otherwise throw an exception
    var insObj = {};
    this.columns.forEach(function(col) {
      insObj[col] = obj[col];
      this._cast(col, insObj);
    }, this);

    // check relations
    Object.keys(this._rels).forEach(function(col) {
      var idcol = col + "_id";
      var exId = insObj[idcol];
      var tbl = this.db.table(this._rels[col]);
      var required = this._colInfos[idcol].required;
      if (!required && exId == null) return;
      var exObj = tbl.one(exId);
      if (!required && exObj == null) {
        insObj[idcol] = null;
        return;
      }
      (exObj) || err("invalid external id", quo(idcol), ":", exId);
    }, this);

    // set id, ins_at, upd_at
    insObj.id || (insObj.id = this._getNewId());
    (!this._data[insObj.id]) || err('the given id "', insObj.id, '" already exists.');
    (insObj.id != Table.ID_TEMP) || err('id cannot be', Table.ID_TEMP);

    if (insObj.ins_at == null) insObj.ins_at = new Date().getTime();
    if (insObj.upd_at == null) insObj.upd_at = insObj.ins_at;

    // insert a new value
    this._data[insObj.id] = insObj;

    // unique index checking (including this._indexes.id)
    try {
      Object.keys(this._indexes).forEach(function(idxName) {
        this._checkUnique(idxName, insObj);
      }, this);
    }
    catch (e) {
      delete this._data[insObj.id]; // rollback
      throw e;
      return null;
    }

    // save indexes
    Object.keys(this._indexes).forEach(function(columns) {
      var list = this._indexes[columns];
      list.insert(insObj.id);
    }, this);

    // save classes 
    Object.keys(this._classes).forEach(function(columns) {
      var cls = this._classes[columns];
      var values = columns.split(',').map(function(col) { return insObj[col] }).join(',');
      if (!cls[values]) cls[values] = {};
      cls[values][insObj.id] = 1;
    }, this);

    this._insertRelations(obj, insObj);

    if (!options.sub && this.db._autosave) this.db.save(); // autosave
    // else if (this.db._tx) this.db._tx.push([JSRel._DEL, this.name, insObj.id]);

    return copy(insObj);
  };


  Table.prototype._insertRelations = function(obj, insObj) {
    Object.keys(this._referreds).forEach(function(exTbl) {
      var cols = Object.keys(this._referreds[exTbl]);
      var inserts = {};
      if (cols.length == 1) {
        var col = cols[0];
        var arr = obj[exTbl] || obj[exTbl + "." + col]; // FIXME : non-array value is set to obj[exTbl] (rare)
        if (!Array.isArray(arr)) return;
        inserts[col] = arr;
      }
      else {
        cols.forEach(function(col) {
          var arr = obj[exTbl + "." + col];
          if (!Array.isArray(arr)) return;
          inserts[col] = arr;
        });
      }

      Object.keys(inserts).forEach(function(col) {
        var arr = inserts[col];
        var tbl = this.db.table(exTbl);
        inserts[col].forEach(function(v) {
          v[col + "_id"] = insObj.id;
          tbl.ins(v);
        });
      }, this);
    }, this);

  };






  /**
   * table.upd(obj)
   **/
  Table.prototype.upd = function(obj, options) {
    options || (options = {});
    // checking id
    (obj && obj.id != null && obj.id != Table.ID_TEMP) || err('id is not found in the given object.');
    obj.id = Number(obj.id);
    var old = this._data[obj.id];
    (old) || err("Cannot update. Object not found in table", this.name);

    // delete timestamp (prevent manual update)
    if (!options.force) {
      delete obj.ins_at;
      delete obj.upd_at;
    }
    else {
      if ("ins_at" in obj) obj.ins_at = Number(obj.ins_at);
      obj.upd_at = new Date().getTime();
    }

    // converting related object
    this._convertRelObj(obj);

    var updObj = {id: obj.id}, updKeys = [];
    this.columns.forEach(function(col) {
      if (obj.hasOwnProperty(col)) {
        var v = obj[col];
        updObj[col] = v;
        if (v !== old[col]) updKeys.push(col);
        this._cast(col, obj); // cast given data if possible
      }
      else {
        updObj[col] = old[col];
      }

    }, this);


    // checking related tables
    updKeys.forEach(function(col) {
      var tbl = this._rels[col];
      if (!tbl) return;
      var idcol = col + "_id";
      if (idcol in updObj) {
        var exId = updObj[idcol];
        var required = this._colInfos[idcol].required;
        if (!required && exId == null) return;
        var exObj = this.db.one(tbl, exId);
        if (!required && exObj == null) {
          updObj[idcol] = null;
          return;
        }
        (exObj) || err("invalid external id", quo(idcol), ":", exId);
      }
    }, this);
    
    // remove old indexes
    var updIndexPoses = {};
    updKeys.forEach(function(column) {
      var idxNames = this._idxKeys[column];
      if (!idxNames) return;
      idxNames.forEach(function(idxName) {
        var list = this._indexes[idxName];
        list.keys(updObj.id).some(function(k) {
          if (list[k] ==  updObj.id) {
            updIndexPoses[idxName] = k;
            return true;
          }
        });
        (updIndexPoses[idxName] >= 0) || err('invalid index position: ', idxName, "in", updObj.id);
        list.remove(updIndexPoses[idxName]);
      }, this);
    }, this);

    // update
    this._data[obj.id] = updObj;

    // unique index checking for updKeys
    try {
      updKeys.forEach(function(column) {
        var idxNames = this._idxKeys[column];
        if (!idxNames) return;
        idxNames.forEach(function(idxName) {
          this._checkUnique(idxName, updObj);
        }, this);
      }, this);

    }
    catch (e) {
      this._data[obj.id] = old; // rollback
      Object.keys(updIndexPoses).forEach(function(idxName) {
        this._indexes[idxName].insert(old.id);
      }, this);
      throw e;
      return null;
    }

    // update indexes
    Object.keys(updIndexPoses).forEach(function(idxName) {
      var list = this._indexes[idxName];
      list.insert(obj.id);
    }, this);

    // update classes 
    Object.keys(this._classes).forEach(function(columns) {
      var cls = this._classes[columns];
      var cols = columns.split(',');
      var toUpdate = cols.every(function(col) { return updKeys.indexOf(col) >= 0 });
      if (!toUpdate) return;
      var oldval = cols.map(function(col) { return old[col] })
      var newval = cols.map(function(col) { return updObj[col] })
      if (oldval === newval) return;
      (cls[oldval][updObj.id] === 1) ||
          err('update object is not in classes.', updObj.id, "in table", quo(this.name));
      delete cls[oldval][updObj.id];
      if (Object.keys(cls[oldval]).length == 0) delete cls[oldval];
      if (!cls[newval]) cls[newval] = {};
      cls[newval][updObj.id] = 1;
    }, this);

    // updating 1:N objects
    this._updateRelations(obj, updObj, options.append);

    if (!options.sub && this.db._autosave) this.db.save(); // autosave
    // else if (this.db._tx) this.db._tx.push([JSRel._UPD, this.name, updKeys.reduce(function(ret, col) {
    //   ret[col] = old[col];
    //   return ret;
    // }, {})]);
    return updObj;
  };

  Table.prototype._updateRelations = function(obj, updObj, append) {
    Object.keys(this._referreds).forEach(function(exTbl) {
      var cols = Object.keys(this._referreds[exTbl]);
      var updates = {};
      if (cols.length == 1) {
        var col = cols[0];
        var arr = obj[exTbl] || obj[exTbl + "." + col]; // FIXME : non-array value is set to obj[exTbl] (rare)
        if (!Array.isArray(arr)) return;
        updates[col] = arr;
      }
      else {
        cols.forEach(function(col) {
          var arr = obj[exTbl + "." + col];
          if (!Array.isArray(arr)) return;
          updates[col] = arr;
        });
      }

      Object.keys(updates).forEach(function(col) {
        var arr = updates[col];
        var idhash = arr.reduce(function(o, v) {
          if (v.id) o[v.id] = v;
          return o;
        }, {});

        var query = {};
        query[col + "_id"] = updObj.id;
        var tbl = this.db.table(exTbl);
        var oldIds = tbl.find(query, {select: "id"});
        // delete related objects
        if (!append) oldIds.forEach(function(id) { if (!idhash[id]) tbl.del(id) });
        // update related objects
        oldIds.forEach(function(id) { if (idhash[id]) tbl.upd(idhash[id]) });
        // insert new objects
        arr.forEach(function(v) {
          if (v.id) return;
          v[col + "_id"] = updObj.id;
          tbl.ins(v);
        });
      }, this);

    }, this);

  };


  /**
   * table.find(query, options)
   * (_priv is a private argument)
   **/
  Table.prototype.find = function(query, options, _priv) {
    options || (options = {});
    _priv || (_priv = {});
    var report = Table._buildReportObj(options.explain);

    // search
    var keys = this._indexes.id;
    query = (_priv.normalized) ? query : Table._normalizeQuery(query);
    if (query) {
      keys = cup(query.map(function(condsList) {
        var ks = null;

        Object.keys(condsList).forEach(function(column) {
          ks = cup(condsList[column].map(function(cond) {
            var localKeys = ks ? ks.slice() : null;

            Object.keys(cond).forEach(function(condType) {
              localKeys = this._optSearch(column, condType, cond[condType], localKeys, report);
            }, this);

            return localKeys;
          }, this));

        }, this);

        return ks;
      }, this));
    }
    else if (report) {
      report.searches.push({searchType: "none"});
    }

    // join
    var joins = null, joinCols = null;
    if (options.join) {
      var joinInfos = this._getJoinInfos(options.join);
      joins = {};
      joinCols = []; // inner + outer joins
      var reqCols = []; // inner joins

      // joining 1:N relation
      joinInfos.N.forEach(function(info) {
        report && Table._reportSubQuery(report, info, "1:N");
        var idcol = info.col, name = info.name, tblObj = this.db.table(info.tbl);
        joinCols.push(name);
        if (info.req) reqCols.push(name);

        if (info.emptyArray) keys.forEach(function(id) {
          if (!joins[id]) joins[id] = {};
          if (!joins[id][name]) joins[id][name] = [];
        });

        tblObj.find(info.query, info.options, {usedTables: _priv.usedTables}).forEach(function(result) {
          var id = result[idcol];
          if (!joins[id]) joins[id] = {};
          if (!joins[id][name]) joins[id][name] = [];
          joins[id][name].push(result);
        });

        if (info.offset != null || info.limit != null) {
          Object.keys(joins).forEach(function(id) {
            var arr = joins[id][name];
            if (arr) joins[id][name] = Table._offsetLimit(arr, info.offset, info.limit);
          });
        }

        if (info.select) {
          if (typeof info.select == "string") {
            Object.keys(joins).forEach(function(id) {
              var arr = joins[id][name];
              if (arr) joins[id][name] = joins[id][name].map(function(v) { return v[info.select] });
            });
          }
          else {
            (Array.isArray(info.select)) || err("typeof options.select must be one of string, null, array");
            Object.keys(joins).forEach(function(id) {
             var arr = joins[id][name];
             if (arr) joins[id][name] = join[id][name].map(function(v) {
               return info.select.reduce(function(ret, k) {
                 ret[k] = v[k];
                 return ret;
               }, {});
             });
           });
         }
       }
      }, this);

      joinInfos[1].forEach(function(info) {
        report && Table._reportSubQuery(report, info, "N:1");
        var idcol  = info.col;
        var name   = info.name;
        var tblObj = this.db.table(info.tbl);
        var q = Table._normalizeQuery(info.query);

        joinCols.push(name);
        if (info.req) reqCols.push(name);

        keys.forEach(function(id) {
          var exId = tblObj._survive(this._data[id][idcol], q, true);
          if (exId == null) return;
          if (!joins[id]) joins[id] = {};
          joins[id][name] = tblObj._data[exId];
        }, this);
      }, this);

      // inner join filter
      keys = keys.filter(function(id) {
        var joinCols = joins[id];
        if (!joinCols) joinCols = {};
        return reqCols.every(function(col) { return joinCols[col] });
      }, this);
    }

    // order by
    keys = this._orderBy(keys, options.order, report);

    // offset, limit
    keys = Table._offsetLimit(keys, options.offset, options.limit);

    // select 
    return this._select(keys, options.select, joins, joinCols);
  };


  /**
   * table.one(query, options)
   **/
  Table.prototype.one = function(query, options, _priv) {
    if (typeof query == "number" || !isNaN(Number(query))) {
      // if (!options && !_priv) return this._data[query] || null;
      query = {id : query};
    }
    var ret = this.find(query, options, _priv);
    return (ret.length) ? ret[0] : null;
  };

  /**
   * table.count(query)
   **/
  Table.prototype.count = function(query) {
    if (!query) return this._indexes.id.length;
    return this.find(query, {select: "id"}).length;
  };

  /**
   * table.del(id)
   **/
  Table.prototype.del = function(arg, options) {
    options || (options = {});
    var delList;
    if (typeof arg == "number") {
      (this._data[arg]) || err("id", arg, "is not found in table", this.name);
      delList = [this._data[arg]];
    }
    else {
      delList = this.find(arg);
    }

    delList.forEach(function(obj) {
      // delete index
      Object.keys(this._indexes).forEach(function(idxName) {
        var list = this._indexes[idxName];
        var keys = list.keys(obj.id);
        (keys != null) || err("invalid keys"); // for debugging
        var bool = keys.some(function(key) {
          if (obj.id == list[key]) {
            list.remove(key);
            return true;
          }
        });
        (bool) || err("index was not deleted."); // for debugging
      }, this);

      // delete classes 
      Object.keys(this._classes).forEach(function(columns) {
        var cls = this._classes[columns];
        var cols = columns.split(',');
        var val = cols.map(function(col) { return obj[col] });
        (cls[val][obj.id] === 1) || err('deleting object is not in classes.', quo(obj.id), "in table", quo(this.name));
        delete cls[val][obj.id];
        if (Object.keys(cls[val]).length == 0) delete cls[val];
      }, this);

      // delete object
      delete this._data[obj.id];

      // if (options.sub) {
      //   var txlist = [[JSRel._INS, this.name, copy(obj)]];
      // }
      // var subs = [];

      // delete referring columns
      Object.keys(this._referreds).forEach(function(exTable) {
        var query = {}, info = this._referreds[exTable];
        Object.keys(info).forEach(function(colName) {
          var required = info[colName];
          query[colName + '_id'] = obj.id;

          if (required) { // delete
            this.db.table(exTable).del(query, {sub: true});
          }
          else {  // set null
            var upd = {};
            upd[colName + '_id'] = null;
            this.db.table(exTable).find(query).forEach(function(o) {
              upd.id = o.id;
              this.db.table(exTable).upd(upd, {sub: true});
            }, this);
          }
        }, this);
      }, this);
    }, this);

    if (!options.sub && this.db._autosave) this.db.save(); // autosave
    // else if (options.sub && this.db._tx) options.sub.push([JSRel._INS, this.name, obj, subs]);
    // else if (this.db._tx) this.db._tx.push(txlist);

    return this;
  };

/**********
 * JSRel.Table private functions 
 *********/

  /**
   * get new id
   **/
  Table.prototype._getNewId = function() {
    var len = this._indexes.id.length;
    if (!len) return 1;
    return this._indexes.id[len-1] + 1;
  };


  /**
   * do optimal search
   * returns id list
   **/
  Table.prototype._optSearch = function(col, condType, value, ids, report) {
    (this._colInfos[col]) || err("unknown column", quo(col));
    var lists = {
      index  : this._indexes[col],
      classes: this._classes[col],
      noIndex: ids
    };
    var searchType;
    if ((ids && ids.length < Table.NOINDEX_MIN_LIMIT) || 
        (!lists.index && !lists.classes) || condType == "like") {
      searchType = 'noIndex';
    }
    else {
      switch (condType) {
      default: err('undefined condition', quo(condType));
      case "equal":
      case "$in":
        searchType = lists.classes ? 'classes' : 'index';
        break;
      case "gt":
      case "ge":
      case "lt":
      case "le":
        searchType = lists.index ? 'index' : 'classes';
        break;
      case "like$":
        searchType = lists.index ? 'index' : 'noIndex';
        break;
      }
    }
    var result = Queries[searchType][condType].call(this, col, value, lists[searchType] || this._indexes.id);
    var ret = (searchType == "noIndex" || !ids) ? result : hashFilter(ids, result);
    if (report) {
      report.searches.push({
        searchType: searchType, condition: condType, column: col, value: value,
        count: result.length, before: ids ? ids.length : null, after: ret.length});
    }
    return ret;
  };

  /**
   * search using index
   **/
  Table.prototype._idxSearch = function(list, obj, fn, nocopy) {
    var ob = (nocopy) ? obj : copy(obj);
    if (ob.id == null) ob.id = Table.ID_TEMP;
    this._data[Table.ID_TEMP] = ob; // temporary register the data
    var ret = fn.call(this, ob, this._data);
    delete this._data[Table.ID_TEMP]; // remove temporary object
    return ret;
  };

  /**
   * search using index with column name and value
   **/
  Table.prototype._idxSearchByValue = function(list, col, value, fn) {
    var obj = {};
    obj[col] = value;
    return this._idxSearch(list, obj, fn, true);
  };

  /**
   * converts columns of related objects to xxx_id
   **/
  Table.prototype._convertRelObj = function(obj) {
    Object.keys(this._rels).forEach(function(col) {
      if (obj[col + '_id'] != null) return; // xxxx_id priors to xxxx
      if (obj[col] && obj[col].id != null) {
        obj[col + '_id'] = obj[col].id;
        delete obj[col];
      }
    });
    return obj;
  }

  /**
   * cast obj[colName]
   * FIXME sql compatible type!
   **/
  Table.prototype._cast = function(colName, obj) {
    var val = obj[colName];
    if (Table.AUTO[colName] && val == null) return;
    var colInfo = this._colInfos[colName];

    if (typeof val == Table.TYPES[colInfo.type]) return;

    if (!colInfo.required && val == null) {
      val = colInfo._default;
    }
    else {
      (val != null) || err('column', '"'+colName+'"', 'is required.');
      switch (colInfo.type) {
      case Table._NUM:
        val = Number(val);
        (!isNaN(val)) || err(quo(colName), ":", quo(obj[colName]), "is not a valid number.");
        break;
      case Table._BOOL:
        val = !!val;
        break;
      case Table._STR:
        (typeof val.toString == "function") || err("cannot convert", val, "to string");
        val = val.toString();
        break;
      }
    }
    obj[colName] = val;
    return obj;
  };


  /**
   * check if there are duplicated entries or not
   * if exists, throw an exception.
   **/
  Table.prototype._checkUnique = function(idxName, obj) {
    var list = this._indexes[idxName];
    if (!list._unique) return; // (FIXME) private API of SortedList
    this._idxSearch(list, obj, function(tmpObj, data) {
      (list.key(tmpObj.id) == null) ||
       err("duplicated entry :", idxName.split(",").map(function(col) { return obj[col] }).join(','), "in", idxName);
    });
  };

  /**
   * compress current state
   **/
  Table.prototype._compress = function() {
    var cData    = Table._compressData(this._colInfos, this._data, this._indexes, this._idxKeys);
    var cClasses = Table._compressClasses(this._classes);
    var cRels    = Table._compressRels(this._rels, this._referreds);
    return [cData, cClasses, cRels];
  };

  /**
   * compress data
   **/
  Table._compressData = function(colInfos, data, indexes, idxKeys) {
    var cols = [];
    var compressedColInfos = Object.keys(colInfos).map(function(col) {
      var colInfo = colInfos[col];
      cols.push(colInfo.name);
      return Table.COLKEYS.map(function(key) { return colInfo[key] })
    }, this);

    var boolTypes = cols.reduce(function(ret, col) {
      if (colInfos[col].type == Table._BOOL) ret[col] = 1;
      return ret;
    }, {});

    var compressedData = Object.keys(data).map(function(id) {
      var obj = data[id];
      return cols.map(function(col) { return (boolTypes[col]) ? obj[col] ? 1 : 0 : obj[col] });
    }, this);

    var compressedIndexes = Object.keys(indexes).map(function(idxName) {
      var list = indexes[idxName];
      return [idxName, list._unique, list.toArray()];
    });

    return [compressedColInfos, compressedData, compressedIndexes];
  };


  /**
   * decompress data
   **/
  Table._decompressData = function(cdata) {
    var infos    = cdata[0];
    var darr     = cdata[1];
    var cIndexes = cdata[2];

    var colInfos = {};

    var cols = infos.map(function(info, k) {
      var obj = {};
      Table.COLKEYS.forEach(function(colkey, n) { obj[colkey] = info[n] });
      var col = obj.name;
      colInfos[col] = obj
      return col;
    });

    var boolTypes = cols.reduce(function(ret, col) {
      if (colInfos[col].type == Table._BOOL) ret[col] = 1;
      return ret;
    }, {});

    var data = darr.reduce(function(ret, d, k) {
      var record = {};
      cols.forEach(function(col, k) { record[col] = boolTypes[col] ? !!d[k] : d[k] });
      ret[record.id] = record;
      return ret;
    }, {});

    var indexes = cIndexes.reduce(function(indexes, nameUniqArr) {
      var idxName = nameUniqArr[0];
      var columns = idxName.split(",");
      var uniq = nameUniqArr[1];
      var types = columns.map(function(col) { return colInfos[col].type });
      var arr = nameUniqArr[2];
      indexes[idxName] = Table._getIndex(columns, uniq, types, arr, data);
      return indexes;
    }, {});

    var idxKeys = Table._getIdxKeys(indexes);

    return [colInfos, data, indexes, idxKeys];
  };

  /**
   * compress classes
   **/
  Table._compressClasses = function(classes) {
    return Object.keys(classes).map(function(col) {
      var cls = classes[col];
      var cols = cls.cols;
      delete cls.cols;
      var vals = Object.keys(cls).map(function(val) {
        return [val, Object.keys(cls[val]).map(function(v) { return Number(v) }) ]
      });
      cls.cols = cols;
      return [col, vals];
    });
  };

  /**
   * decompress classes
   **/
  Table._decompressClasses = function(cClasses) {
    return cClasses.reduce(function(classes, colvals) {
      var col = colvals[0];
      classes[col] = colvals[1].reduce(function(cls, valkeys) {
        var val = valkeys[0];
        cls[val] = valkeys[1].reduce(function(idhash, id) {
          idhash[id] = 1;
          return idhash;
        }, {});
        return cls;
      }, {});
      classes[col].cols = col.split(",");
      return classes;
    }, {});
  };

  // compress relations
  Table._compressRels   = function(rels, referreds) { return [rels, referreds] };
  Table._decompressRels = function(c) { return c };

  Table._columnToSQL = function(info, colConverts) {
    var colType = Table.TYPE_SQLS[info.sqltype];
    var name = (info.name in colConverts) ? colConverts[info.name] : info.name;
    var stmt = [bq(name), colType];
    if (info.required) stmt.push("NOT NULL");
    if (info._default != null) {
      var defa = (info.type == Table._BOOL) 
        ? info._default ? 1 : 0
        : (info.type == Table._STR) ? quo(info._default) : info._default;
      stmt.push("DEFAULT", defa);
    }
    if (name == "id") stmt.push("PRIMARY KEY AUTO_INCREMENT");
    return stmt.join(" ");
  };

  Table._idxToSQL = function(name, list, colConverts) {
    if (name == 'id') return;
    if (name in colConverts) name = colConverts[name];
    var uniq = (list._unique) ? 'UNIQUE ' : '';
    return [uniq + 'INDEX', '(' + name + ')'].join(' ');
  };

  /**
   * SQL
   **/
  Table.prototype._toDropSQL = function(options) {
    var ifExist = true;
    return "DROP TABLE " + (ifExist ? 'IF EXISTS ' : '') + bq(this.name) + ';';
  };

  Table.prototype._toCreateSQL = function(options) {
    options || (options = {});
    var colConverts = options.columns || {};
    delete colConverts.id; // TODO alert to developers.

    // structure
    var substmts = this.columns.map(function(col){ return Table._columnToSQL(this._colInfos[col], colConverts) }, this);

    Object.keys(this._indexes).forEach(function(idxName) {
      var idxSQL = Table._idxToSQL(idxName, this._indexes[idxName], colConverts);
      if (idxSQL) substmts.push(idxSQL);
    }, this);

    Object.keys(this._rels).forEach(function(fkey) {
      var exTbl = this._rels[fkey];
      var fkey_disp = (fkey in colConverts) ? colConverts[fkey] : (fkey + "_id");
      var stmt = "FOREIGN KEY (" + fkey_disp + ") REFERENCES " + exTbl + '(id)';
      var required = this.db.table(exTbl)._referreds[this.name][fkey];
      if (required) stmt += " ON UPDATE CASCADE ON DELETE CASCADE";
      else stmt += " ON UPDATE NO ACTION ON DELETE SET NULL";
      substmts.push(stmt);
    }, this)

    return "CREATE TABLE " + bq(this.name) + "(" + substmts.join(",") + ")" 
           + (options.type == "mysql" && options.engine ? ' ENGINE=' + options.engine : '') + ';';
  };

  Table.prototype._toInsertSQL = function(options) {
    options || (options = {});
    var colConverts = options.columns || {};
    delete colConverts.id; // TODO alert to developers.

    var colInfos = this._colInfos;
    var boolTypes = this.columns.reduce(function(ret, col) {
      if (colInfos[col].type == Table._BOOL) ret[col] = 1;
      return ret;
    }, {});

    var columnNames = this.columns.map(function(name) {
      return (name in colConverts) ? colConverts[name] : name;
    });

    var valConverts = options.values || {};
    Object.keys(valConverts).forEach(function(col) {
      if (typeof valConverts[col] != "function") delete valConverts[col];
    });
    var stmt = ["INSERT INTO ", bq(this.name), "(", columnNames.map(bq).join(",") ,") VALUES "].join(" ");
    var ret = [];
    var cur;
    for (var i=0, l = this._indexes.id.length; i<l; i++) {
      var id = this._indexes.id[i];
      var record = this._data[id];
      var vals = this.columns.map(function(col) {
        var v = record[col];
        if (col in valConverts) v = valConverts[col](v);
        return boolTypes[col] ? v ? 1 : 0 : (typeof v == "number") ? v : quo(v);
      }).join(",");
      if (i%1000 == 0) {
        if (cur) ret.push(cur);
        cur = {st : stmt, ar: []};
      }
      cur.ar.push('(' + vals + ')');
    }
    if (cur && cur.ar.length) ret.push(cur);
    return ret.map(function(cur) {
      return cur.st + cur.ar.join(',\n') + ';\n';
    }).join("\n");
  };

  /**
   * parse raw stringified data
   **/
  Table.prototype._parseRaw = function(info) {
    var indexes = info._indexes;
    delete info._indexes;
    Object.keys(info).forEach(function(k) { this[k] = info[k] }, this);

    // set _indexes
    Object.keys(indexes).forEach(function(idxName) {
      var ids = indexes[idxName];
      var isUniq = ids._unique; // FIXME private API of SortedList
      this._setIndex(idxName.split(','), isUniq, Array.prototype.slice.call(ids));
    }, this);
    return this;
  };


  /**
   * decompress compressed data
   **/
  Table.prototype._parseCompressed = function(c) {
    var colInfoDataIdxesKeys = Table._decompressData(c[0]);
    this._colInfos = colInfoDataIdxesKeys[0];
    this._data     = colInfoDataIdxesKeys[1];
    this._indexes  = colInfoDataIdxesKeys[2];
    this._idxKeys  = colInfoDataIdxesKeys[3];

    this._classes  = Table._decompressClasses(c[1]);

    var relsReferreds = Table._decompressRels(c[2]);
    this._rels      = relsReferreds[0];
    this._referreds = relsReferreds[1];
  };


  /**
   * parse schema
   **/
  Table.prototype._parseSchema = function(colInfos) {
    colInfos = copy(colInfos);
    var tblName = this.name;

    Table.INVALID_COLUMNS.forEach(function(col) {
      (colInfos[col] == null) || err(col, "is not allowed for a column name");
    });


    // getting indexes, uniques, classes
    var metaInfos = ["$indexes", "$uniques", "$classes"].reduce(function(ret, k) {
      ret[k] = arrayize(colInfos[k], true);
      delete colInfos[k];
      return ret;
    }, {});

    // set default columns
    colInfos.id = 1;
    colInfos.upd_at = 1;
    colInfos.ins_at = 1;
    metaInfos.$uniques.unshift("id");
    metaInfos.$indexes.unshift("upd_at", "ins_at");

    var columnNames = Object.keys(colInfos);
    columnNames.forEach(function(col) {
      (col.match(/[,.`"']/) == null) || err("comma, dot and quotations cannot be included in a column name.");
    });

    // parsing and registering columns
    (columnNames.length > 3) || err('table', quo(tblName), 'must contain at least one column.');

    columnNames.forEach(function(colName) {
      var parsed = this._parseColumn(colName, colInfos[colName]);
      (this._colInfos[parsed.name] == null) || err(quo(parsed.name), "is already registered.")
      this._colInfos[parsed.name] = parsed;
    }, this);

    // creating relation indexes, relation info
    Object.keys(this._colInfos).forEach(function(colName) {
      var colInfo = this._colInfos[colName];
      var exTblName = colInfo.rel;
      if (!exTblName) return;

      (colName.slice(-3) == '_id') || err('Relation columns must end with "_id".');

      var exTable = this.db.table(exTblName);
      (exTable) || err("Invalid relation: ", quo(exTblName), "is an undefined table in", quo(tblName));
      metaInfos.$indexes.push(colName);
      var col = colName.slice(0, -3);
      this._rels[col] = exTblName;

      if (!exTable._referreds[tblName]) exTable._referreds[tblName] = {};
      exTable._referreds[tblName][col] = this._colInfos[colName].required; // register to a referring table
    }, this);

    // registering meta infos (index, unique, class)
    Object.keys(metaInfos).forEach(function(k) {
      metaInfos[k] = this._normalizeIndexes(metaInfos[k]);
    }, this);
    metaInfos.$indexes.forEach(function(cols) { this._setIndex(cols, false) }, this);
    metaInfos.$uniques.forEach(function(cols) { this._setIndex(cols, true) }, this);
    metaInfos.$classes.forEach(function(cols) { this._setClass(cols) }, this);

    // setting _idxKeys
    this._idxKeys = Table._getIdxKeys(this._indexes);

    return this;
  };


  /**
   * set index columns
   **/
  Table.prototype._setIndex = function(cols, isUniq, ids) {
    var strCols = [];
    var types = cols.map(function(col) {
      var ret = this._colInfos[col].type;
      if (ret == Table._STR) strCols.push(col);
      return ret;
    }, this);

    // reduce bytesize for SQL index
    var len = strCols.length;
    // (len <= 2) || err('1000bytes');
    strCols.forEach(function(col) {
      this._colInfos[col].sqltype = (len > 1) ? Table._CHR2 : Table._CHRS;
    }, this);

    // if duplicated, the former is preferred
    var idxName = cols.join(",");
    if (this._indexes[idxName] != null) return;
    this._indexes[idxName] = Table._getIndex(cols, isUniq, types, ids, this._data);
  };

  /**
   * get sortedList
   **/
  Table._getIndex = function(cols, isUniq, types, ids, data) {
    return SortedList.create({
      compare : generateCompare(types, cols, data),
      unique  : !!isUniq,
      resume  : true
    }, ids);
  };

  /**
   * get index keys from indexes
   **/
  Table._getIdxKeys = function(indexes) {
    return Object.keys(indexes).reduce(function(ret, idxName) {
      idxName.split(',').forEach(function(col) {
        if (!ret[col]) ret[col] = [];
        ret[col].push(idxName);
      });
      return ret;
    }, {});
  };

  /**
   * set class index columns
   * if duplicated, the former is preferred.
   **/
  Table.prototype._setClass = function(cols) {
    var idxname = cols.join(',');
    if (this._classes[idxname] != null) return;
    cols.forEach(function(col) {
      (this._colInfos[col].type != Table._STR) || err('Cannot set class index to string columns', quo(col));
    }, this);
    this._classes[idxname] = {cols: cols};
  };


  /**
   * get join infos
   *
   * joinInfo:
   *  tbl    : table name
   *  col    : column name
   *  req    : required or not
   *  query  : query
   *  options: options 
   *  name   : name
   **/
  Table.prototype._getJoinInfos = function(join) {
    if (join === true) {
      var __j = {};
      Object.keys(this._rels).forEach(function(col) { __j[col] = true });
      join = __j;
    }
    else if (typeof join == "string") {
      var k = join;
      join = {};
      join[k] = true;
    }

    var joinInfos = {"1": [], "N": [], "NM": []};

    Object.keys(join).forEach(function(k) {
      // get relation type
      var joinInfo = { name : k, req: true, options: {} };
      var val = join[k];
      var reltype = this._resolveTableColumn(k, joinInfo, val);

      // get subquery, suboptions
      if (typeof val == "object") {
        if (val.as) joinInfo.name = val.as;
        if (val.outer) joinInfo.req = false;
        if (val.outer == "array") joinInfo.emptyArray = true;
        delete val.as;
        delete val.outer;
        delete val.explain;
        ["limit", "offset", "select"].forEach(function(op) {
          if (val[op] != null) {
            joinInfo[op] = val[op];
            delete val[op];
          }
        });
        ["order", "join"].forEach(function(op) {
          if (val[op] != null) {
            joinInfo.options[op] = val[op];
            delete val[op];
          }
        });
        var qs = val;
        if (val.where) {
          Object.keys(val.where).forEach(function(k) { qs[k] = val.whare[k] });
          delete qs.where;
        }
        joinInfo.query = qs;
      }
      joinInfos[reltype].push(joinInfo);
    }, this);
    return joinInfos;
  };

  /**
   * resolve table name and column name.
   * returns reltype
   **/
  Table.prototype._resolveTableColumn = function(k, joinInfo, val) {
    var spldot = k.split("."), len = spldot.length, reltype;
    (len <= 2) || err("invalid expression", quo(k));
    if (len == 1) {
      if (this._rels[k]) {
        joinInfo.col = k + "_id";
        joinInfo.tbl = this._rels[k];
        reltype = "1";
      }
      else {
        var tbl = k;
        var referred = this._referreds[tbl];
        if (!referred) { // checking N:M relation ("via")
          (typeof val == "object" && val.via != null) || err("table", quo(tbl), "is not referring table", quo(this.name));
          var reltype = this._resolveTableColumn(val.via, joinInfo);
          delete val.via;
          var subval = {};
          Object.keys(val).forEach(function(option) {
            if (option == "as") return;
            subval[option] = val[option];
            if (option != "outer") delete val[option];
          });
          val.join = {};
          val.join[k] = subval;
          val.select = k;

        }
        else {
          var refCols = Object.keys(referred);
          (refCols.length == 1) || err("table", quo(tbl), "refers", quo(this.name), "multiply");
          joinInfo.tbl = tbl;
          joinInfo.col= refCols[0] + "_id";
          reltype = "N";
        }
      }
    }
    else { // len == 2
      var tbl = spldot[0];
      var col = spldot[1];
      var referred = this._referreds[tbl];
      var refCols = Object.keys(referred);
      (refCols) || err("table", quo(tbl), "is not referring table", quo(this.name));
      (refCols.indexOf(col) >= 0) || err("table", quo(tbl), "does not have a column", quo(col));
      joinInfo.tbl = tbl;
      joinInfo.col = col + "_id";
      reltype = "N";
    }
    return reltype;
  };


  /**
   * normalizing meta infos
   *
   **/
  Table.prototype._normalizeIndexes = function(arr) {
    return arr.map(function(def) {
      def = arrayize(def);
      return def.map(function(col) {
        if (this._rels[col]) col = col + "_id";
        (this._colInfos[col] != undefined) || err(quo(col), "is unregistered column. in", quo(this.name));
        return col;
      }, this);
    }, this);
  };

  /**
   * parse definition of columns
   **/
  Table.prototype._parseColumn = function(colName, columnOption) {
    var colObj = { name: colName, type: Table._STR, sqltype: Table._STR, required: false, _default: null, rel : false }; // default object

    switch (columnOption) { // @see README.md #column description
      case true :
        colObj.required = true;
        break;

      case "str"  :
      case "text" :
      case false  :
        break;

      case "req":
        colObj.type = Table._STR;
        colObj.sqltype = Table._CHRS;
        colObj.required = true;
        break;

      case "not":
      case "chars":
      case "":
        colObj.type = Table._STR;
        colObj.sqltype = Table._CHRS;
        break;

      case 1 :
        colObj.type = Table._NUM;
        colObj.sqltype = Table._INT;
        colObj.required = true;
        break;

      case "int" :
      case 0 :
        colObj.type = Table._NUM;
        colObj.sqltype = Table._INT;
        break;

      case "num" :
      case "float" :
        colObj.type = colObj.sqltype = Table._NUM;
        break;

      case 1.1 :
        colObj.type = colObj.sqltype = Table._NUM;
        break;

      case 0.1 :
        colObj.type = colObj.sqltype = Table._NUM;
        colObj.required = true;
        break;

      case "on" :
        colObj.type = colObj.sqltype = Table._BOOL;
        colObj._default = true;
        break;

      case "bool" :
      case "off" :
        colObj.type = Table._BOOL;
        colObj._default = false;
        break;

      default:
        if (typeof columnOption == 'string') columnOption = { type: columnOption };

        (columnOption && columnOption.type) || err('invalid column description.');
        switch (columnOption.type) {
          case 'text'   :
          case 'string' :
          case 'str'    : colObj.type = colObj.sqltype = Table._STR; break;

          case 'double' :
          case 'float'  :
          case 'number' :
          case 'num'    : colObj.type = colObj.sqltype = Table._NUM;  break;

          case 'boolean' :
          case 'bool' : colObj.type = colObj.sqltype = Table._BOOL; break;

          case 'int'  : colObj.type = Table._NUM;  colObj.sqltype = Table._INT;  break;
          case 'chars': colObj.type = Table._STR;  colObj.sqltype = Table._CHRS; break;

          default: // must be table name
            colObj.name += '_id';
            colObj.type = Table._NUM;
            colObj.sqltype = Table._INT;
            colObj.rel = columnOption.type;
            if (columnOption.required == undefined) columnOption.required = true; // in related columns, values are required by default
            break;
        }

        if (columnOption._default != null) {
          (typeof columnOptions._default == Table.TYPES[colObj.type]) ||
            err("type of the default value", columnOption._default, "does not match", Table.TYPES[colObj.type],
            "in", colObj.name);
          colObj._default = columnOption._default;
          if (colObj.sqltype == Table._STR) colObj.sqltype = Table._CHRS;
        }
        if (columnOption.required) colObj.required = !!columnOption.required;
        break;
    }
    return colObj;
  };

  // sort keys with order(s)
  Table.prototype._orderBy = function(keys, order, report) {
    if (!order) return keys;
    var orders = objectize(order, "asc"); 
    Object.keys(orders).reverse().forEach(function(k) {
      var orderType = orders[k];
      if (this._indexes[k] && keys.length * 4 > this._indexes.id.length) {
        if (report) report.orders.push({column: k, type: orderType, method: "index"});
        var idx = this._indexes[k];
        keys = hashFilter(idx, keys);
        if (orderType == "desc") keys = keys.reverse();
      }
      else {
        keys = keys.slice().sort(generateCompare(this._colInfos[k].type, k, this._data));
        if (report) report.orders.push({column: k, type: orderType, method: "sort"});
        if (orderType == "desc") keys = keys.reverse();
      }
    }, this);
    return keys;
  };


  // select columns
  Table.prototype._select = function(keys, cols, joins, joinCols) {
    // when cols is one column
    if (typeof cols == "string") {
      if (cols == "id")
        return (keys.length == 0 || typeof keys[0] == "number") ? keys : keys.map(function(v) { return Number(v) });

      if (joinCols && joinCols.indexOf(cols) >= 0) return keys.map(function(id) { return joins[id][cols] }, this);
      (this._colInfos[cols]) || err("column", quo(cols), "is not found in table", quo(this.name));
      return keys.map(function(id) { return this._data[id][cols] }, this);
    }

    // when cols is not defined
    if (cols == null) {
      var ret = keys.map(function(id) { return copy(this._data[id]) }, this);
      // bind objects
      if (joins && joinCols && joinCols.length) {
        ret.forEach(function(obj) {
          joinCols.forEach(function(col) {
            obj[col] = (joins[obj.id] == null) ? null : joins[obj.id][col];
          });
        });
      }
      return ret;
    }

    (Array.isArray(cols)) || err("typeof options.select", cols, "must be string, null, or array");

    // when cols is array
    var inputCols = cols;
    var _joinCols = [], cols = [];
    inputCols.forEach(function(col) {
      if (joins && joinCols && joinCols.indexOf(col) >= 0) {
        _joinCols.push(col);
      }
      else if (this._colInfos[col]) {
        cols.push(col);
      }
      else {
        err("column", quo(col), "is not found in table", quo(this.name));
      }
    }, this);

    var ret = keys.map(function(id) {
      var ob = {};
      cols.forEach(function(col) { ob[col] = this._data[id][col] }, this)
      return ob;
    }, this);

    // bind objects
    if (joins && _joinCols.length) {
      ret.forEach(function(obj) {
        _joinCols.forEach(function(col) {
          obj[col] = joins[obj.id][col];
        });
      });
    }
    return ret;
  };


  // if object of the given id match the query, returns id. otherwise returns false
  Table.prototype._survive = function(id, query, normalized) {
    if (!query) return id;
    var that = this;
    query = (normalized) ? query : Table._normalizeQuery(query);
    return query.some(function(condsList) {
      return Object.keys(condsList).every(function(column) {
        return condsList[column].some(function(cond) {
          return Object.keys(cond).every(function(condType) {
            return Queries.noIndex[condType].call(that, column, cond[condType], [id]).length;
          });
        });
      });
    }) ? id : null;
  };


  // normalize query
  Table._normalizeQuery = function(query) {
    if (!query || !Object.keys(query).length) return null;
    return arrayize(query).map(function(condsList) {
      return Object.keys(condsList).reduce(function(ret, column) {
        ret[column] = arrayize(condsList[column]).map(function(cond) {
          return (typeof cond == "object") ? cond : { equal: cond };
        });
        return ret;
      }, {});
    });
  };

  // report subquery
  Table._reportSubQuery = function(report, info, reltype) {
    var subreport = {reltype: reltype, table: info.tbl, join_column: info.col, name: info.name, outer: !info.req, emptyArray: !!info.emptyArray };
    info.options.explain = subreport;
    report.subqueries.push(subreport);
  };

  // slice array with offset and limit
  Table._offsetLimit = function(keys, offset, limit) {
    if (offset == null && limit == null)  return keys;
    offset = offset || 0;
    var end = limit ? (limit + offset) : keys.length;
    return keys.slice(offset, end);
  };

  // build an object to explain find()
  Table._buildReportObj = function(obj) {
    if (!obj) return null;
    if (!obj.searches) obj.searches = [];
    if (!obj.subqueries) obj.subqueries = [];
    if (!obj.orders) obj.orders = [];
    return obj;
  };

  /**
   * generate comparison function
   **/
  function generateCompare(types, columns, data) {
    types = arrayize(types), columns = arrayize(columns);
    if (columns.length == 1) {
      if (columns[0] == "id") return compares[Table._NUM];
      var fn = compares[types[0]], col = columns[0];
      return function(id1, id2) {
        return fn(data[id1][col], data[id2][col]);
      }
    }
    return function(id1, id2) {
      var a = data[id1], b = data[id2];
      var ret = 0;
      types.some(function(type, k) {
        var col = columns[k];
        ret = compares[type](a[col], b[col]);
        return ret;
      });
      return ret;
    }
  }

  // basic comparison functions
  var compares = {};
  compares[Table._BOOL] = function(a, b) { return (a == b) ? 0 : (a) ? 1 : -1 };
  compares[Table._NUM] = SortedList.compares["number"]; // (FIXME) private API of SortedList
  compares[Table._STR] = SortedList.compares["string"]; // (FIXME) private API of SortedList


/**********
 * shortcut
 *********/
  Object.keys(Table.prototype).forEach(function(name) {
    if (name.charAt(0) == '_') return;

    var method = Table.prototype[name]; 
    if (typeof method != "function") return;
    JSRel.prototype[name] = function() {
      var tblName = Array.prototype.shift.call(arguments);
      var tbl = this.table(tblName);
      (tbl) || err('invalid table name', quo(tblName));
      return tbl[name].apply(tbl, arguments);
    };
  });


/**********
 * Queries
 *********/
  var Queries = {index: {}, classes: {}, noIndex: {}};
  Queries.index.equal = function(col, value, list) {
    return this._idxSearchByValue(list, col, value, function(obj, data) {
      var keys = list.keys(obj.id);
      return keys ? keys.map(function(k) { return list[k] }) : [];
    });
  };

  Queries.index.like$ = function(col, value, list) {
    return this._idxSearchByValue(list, col, value, function(obj, data) {
      var pos = list.bsearch(obj.id);
      var key = list.key(obj.id, pos);
      var results = [];
      var i = (key != null) ? key : pos+1, len = list.length, cur, v;
      var included = false;
      do {
        cur = data[list[i]], v = cur[col];
        if (v.indexOf(value) == 0) {
          included = true;
          results.push(cur.id);
        }
        else included = false;
      }
      while(++i < len && (v <= value || included));
      return results;
    }, this);
  };

  Queries.index.gt = function(col, value, list) {
    if (!list.length) return [];
    return this._idxSearchByValue(list, col, value, function(obj, data) {
      var i = list.bsearch(obj.id)+1, len = list.length, cur, v;
      do {
        cur = data[list[i]], v = cur[col];
      }
      while(++i < len && v <= value);
      return list.slice(i);
    });
  };
  Queries.index.ge = function(col, value, list) {
    if (!list.length) return [];
    return this._idxSearchByValue(list, col, value, function(obj, data) {
      var pos = list.bsearch(obj.id);
      var key = list.key(obj.id, pos);
      return list.slice((key != null) ? key : pos+1);
    });
  };
  Queries.index.lt = function(col, value, list) {
    if (!list.length) return [];
    return this._idxSearchByValue(list, col, value, function(obj, data) {
      var pos = list.bsearch(obj.id);
      var key = list.key(obj.id, pos);
      return list.slice(0, (key != null) ? key : pos+1);
    });
  };
  Queries.index.le = function(col, value, list) {
    if (!list.length) return [];
    return this._idxSearchByValue(list, col, value, function(obj, data) {
      var i = list.bsearch(obj.id)+1, len = list.length, cur, v;
      do {
        cur = data[list[i]], v = cur[col];
      }
      while(++i < len && v <= value);
      return list.slice(0, i);
    });
  };
  Queries.index.$in = function(col, values, list) {
    if (!list.length) return [];
    var results = [];
    arrayize(values).forEach(function(value) {
      this._idxSearchByValue(list, col, value, function(obj, data) {
        var k = list.key(obj.id);
        if (k != null) results.push(list[k]);
      });
    }, this);
    return results;
  };

  Queries.noIndex.equal = function(col, value, ids) {
     return ids.filter(function(id) { return this._data[id][col] === value }, this);
  };
  Queries.noIndex.like$ = function(col, value, ids) {
    (this._colInfos[col].type == Table._STR) || err('Cannot use like$ search to a non-string column', col);
    return ids.filter(function(id) { return this._data[id][col].indexOf(value) == 0 }, this);
  };
  Queries.noIndex.like = function(col, value, ids) {
    return ids.filter(function(id) { return this._data[id][col].indexOf(value) >= 0 }, this);
  };
  Queries.noIndex.gt = function(col, value, ids) {
    return ids.filter(function(id) { return this._data[id][col] > value }, this);
  };
  Queries.noIndex.ge = function(col, value, ids) {
    return ids.filter(function(id) { return this._data[id][col] >= value }, this);
  };
  Queries.noIndex.lt = function(col, value, ids) {
    return ids.filter(function(id) { return this._data[id][col] < value }, this);
  };
  Queries.noIndex.le = function(col, value, ids) {
    return ids.filter(function(id) { return this._data[id][col] <= value }, this);
  };
  Queries.noIndex.$in = function(col, values, ids) {
    return ids.filter(function(id) { return arrayize(values).indexOf(this._data[id][col]) >= 0 }, this);
  };

  Queries.classes.equal = function(col, val, cls) {
    return (cls[val]) ? Object.keys(cls[val]) : [];
  };
  Queries.classes.gt = function(col, val, cls) {
    ret = [];
    Object.keys(cls).forEach(function(v) { if (v > val) ret = ret.concat(Object.keys(cls[v])) });
    return ret;
  };
  Queries.classes.ge = function(col, val, cls) {
    ret = [];
    Object.keys(cls).forEach(function(v) { if (v >= val) ret = ret.concat(Object.keys(cls[v])) });
    return ret;
  };
  Queries.classes.lt = function(col, val, cls) {
    ret = [];
    Object.keys(cls).forEach(function(v) { if (v < val) ret = ret.concat(Object.keys(cls[v])) });
    return ret;
  };
  Queries.classes.le = function(col, val, cls) {
    ret = [];
    Object.keys(cls).forEach(function(v) { if (v <= val) ret = ret.concat(Object.keys(cls[v])) });
    return ret;
  };
  Queries.classes.$in = function(col, vals, cls) {
    if (!Array.isArray(vals)) return Queries.classes.equal.call(this, col, vals, cls);
    return cup(vals.map(function(v) { return Queries.classes.equal.call(this, col, v, cls) }, this));
  };
  


/**********
 * Utility functions without referencing any outer scopes
 *********/

  function noop() {}

  function err() {
    var args = Array.prototype.slice.call(arguments);
    args.unshift('[JSRel.js]');
    var err = args.join(" ");
    if (!err) err = "(undocumented error)";
    throw new Error(err);
  }

  /**
   * shallowly copy the given object
   **/
  function copy(obj) {
    var ret = {};
    for (var attr in obj) {
      if (obj.hasOwnProperty(attr)) ret[attr] = obj[attr];
    }
    return ret;
  }

  function unique(arr) {
    var o = {};
    return arr.filter(function(i) { return i in o? false: o[i] = true});                                      
  }

  function cup(arr) {
    return unique(Array.prototype.concat.apply([], arr));
  }

  function quo(v) { return '"'+ v.toString().split('"').join('\\"') + '"'}
  function bq(v) { return "`"+v+"`" }

  // arrayize if not
  function arrayize(v, empty) {
    return Array.isArray(v) ? v : (empty && v == null) ? [] : [v];
  }

  // objectize if string
  function objectize(k, v) {
    if (typeof k != "string") return k;
    var obj = {};
    obj[k] = v;
    return obj;
  }

  // sort arrToHash by order of arrToItr
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


  return JSRel;

})(
  typeof exports == "object" && exports === this, // isNode
  typeof localStorage == 'object' && typeof sessionStorage == 'object', // isBrowser
  typeof SortedList == "function" ? SortedList : null
);

if (JSRel.isNode) module.exports = JSRel; // for Node.js
