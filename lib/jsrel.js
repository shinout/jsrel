(function() {
  var __slice = [].slice,
    __indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

  (function(root, factory) {

    /*
     * for AMD (Asynchronous Module Definition)
     */
    if (typeof define === "function" && define.amd) {
      define(["sortedlist"], factory);
    } else if (typeof module === "object" && module.exports) {
      module.exports = factory();
    } else {
      root.JSRel = factory(root.SortedList);
    }
  })(this, function(SortedList) {
    var JSRel, Queries, Table, arrayize, bq, conjunction, copy, cup, deepCopy, defineConstants, defineGetters, err, fs, generateCompare, isBrowser, isNode, isTitanium, noop, objectize, quo, storages, unique;
    if (!SortedList) {
      SortedList = require("sortedlist");
    }
    isTitanium = typeof Ti === "object" && typeof Titanium === "object" && Ti === Titanium;
    isNode = !isTitanium && (typeof module === "object" && typeof exports === "object" && module.exports === exports);
    isBrowser = typeof localStorage === "object" && typeof sessionStorage === "object";
    storages = {
      mock: (function() {
        var mockData;
        mockData = {};
        return {
          getItem: function(id) {
            return mockData[id] || null;
          },
          setItem: function(id, data) {
            mockData[id] = data;
          },
          removeItem: function(id) {
            return delete mockData[id];
          }
        };
      })()
    };
    if (isBrowser) {
      storages.local = window.localStorage;
      storages.session = window.sessionStorage;
    }
    if (isTitanium) {
      fs = Ti.Filesystem;
      storages.file = {
        getItem: function(k) {
          var file;
          file = fs.getFile(k.toString());
          if (file.exists()) {
            return fs.getFile(k.toString()).read().text;
          } else {
            return null;
          }
        },
        setItem: function(k, v) {
          return fs.getFile(k.toString()).write(v.toString());
        },
        removeItem: function(k) {
          return fs.getFile(k.toString()).deleteFile();
        }
      };
    } else if (isNode) {
      fs = require("fs");
      storages.file = {
        getItem: function(k) {
          var e;
          try {
            return fs.readFileSync(k, "utf8");
          } catch (_error) {
            e = _error;
            return null;
          }
        },
        setItem: function(k, v) {
          return fs.writeFileSync(k, v.toString(), "utf8");
        },
        removeItem: function(k) {
          return fs.unlinkSync(k);
        }
      };
    }
    defineGetters = function(obj, getters) {
      var fn, name, _results;
      _results = [];
      for (name in getters) {
        fn = getters[name];
        _results.push(Object.defineProperty(obj, name, {
          get: fn,
          set: noop
        }));
      }
      return _results;
    };
    defineConstants = function(obj, constants) {
      var name, val, _results;
      _results = [];
      for (name in constants) {
        val = constants[name];
        Object.defineProperty(obj, name, {
          value: val,
          writable: false
        });
        if (typeof val === "object") {
          _results.push(Object.freeze(val));
        } else {
          _results.push(void 0);
        }
      }
      return _results;
    };

    /*
     * public
     * - id
     * - name
     * - tables : list of tables (everytime dynamically created)
     * 
     * private
     * - _storage  : storage name
     * - _autosave : boolean
     * - _tblInfos : { tableName => Table object }
     * - _hooks    : { eventName => [function, function...] }
     */
    JSRel = (function() {
      JSRel._dbInfos = {};


      /*
       * class properties
       * uniqIds: list of uniqIds
       * isNode, isTitanium, isBrowser: environment detection. boolean 
       * storage: available storages (array)
       */

      defineGetters(JSRel, {
        uniqIds: function() {
          return Object.keys(this._dbInfos);
        }
      });

      defineConstants(JSRel, {
        isNode: isNode,
        isTitanium: isTitanium,
        isBrowser: isBrowser,
        storages: storages
      });


      /*
       * constructor
       *
       * called only from JSRel.use or JSRel.$import
       * arguments
       * - uniqId   :
       * - name     :
       * - storage  :
       * - autosave :
       * - format   : format of tblData to parse (one of Raw, Schema, Compressed)
       * - tblData  :
       * - loaded   : if loaded from stored data, true
       */

      function JSRel(uniqId, name, _storage, _autosave, format, tblData, loaded) {
        var colData, tblName;
        this._storage = _storage;
        this._autosave = _autosave;
        defineConstants(this, {
          id: uniqId,
          name: name
        });
        this.constructor._dbInfos[uniqId] = {
          db: this,
          storage: this._storage
        };
        this._hooks = {};
        this._tblInfos = {};
        this._loaded = !!loaded;
        for (tblName in tblData) {
          colData = tblData[tblName];
          this._tblInfos[tblName] = new Table(tblName, this, colData, format);
        }
      }


      /*
       * JSRel.use(uniqId, option)
       *
       * Creates instance if not exist. Gets previously created instance if already exists
       * - uniqId: the identifier of the instance, used for storing the data to external system(file, localStorage...)
       * - options:
       *   - storage(string) : type of external storage. one of mock, file, local, session
       *   - schema (object) : DB schema. See README.md for detailed information
       *   - reset  (boolean) : if true, create db even if previous db with the same uniqId already exists.
       *   - autosave (boolean) : if true, save at every action(unstable...)
       *   - name (string) : name of the db
       *   <private options>
       *   - __create (boolean) : throws an error if db already exists.
       */

      JSRel.use = function(uniqId, options) {
        var dbJSONstr, format, name, storage, storedInMemory, tblData;
        if (options == null) {
          options = {};
        }
        uniqId || err("uniqId is required and must be non-zero value.");
        uniqId = uniqId.toString();
        storedInMemory = this._dbInfos[uniqId];
        if (storedInMemory != null) {
          if (options.__create) {
            err("uniqId", quo(uniqId), "already exists");
          }
          if (!options || !options.reset) {
            return this._dbInfos[uniqId].db;
          }
        }
        options.storage = options.storage || (isNode || isTitanium ? "file" : isBrowser ? "local" : "mock");
        storage = this.storages[options.storage];
        storage || err("options.storage must be one of " + Object.keys(this.storages).map(quo).join(","));
        if (!options.reset && (dbJSONstr = storage.getItem(uniqId))) {
          return JSRel.$import(uniqId, dbJSONstr, {
            force: false
          });
        } else {
          options.schema && typeof options.schema === "object" || err("options.schema is required");
          Object.keys(options.schema).length || err("schema must contain at least one table");
          format = "Schema";
          tblData = deepCopy(options.schema);
          name = options.name != null ? options.name.toString() : uniqId;
          return new JSRel(uniqId, name, options.storage, !!options.autosave, format, tblData);
        }
      };

      JSRel.createIfNotExists = JSRel.use;


      /*
       * JSRel.create(uniqId, option)
       *
       * Creates instance if not exist. Throws an error if already exists
       * - uniqId: the identifier of the instance, used for storing the data to external system(file, localStorage...)
       * - options:
       *   - storage(string) : type of external storage. one of mock, file, local, session
       *   - schema (object) : DB schema. See README.md for detailed information
       *   - autosave (boolean) : if true, save at every action(unstable...)
       *   - name (string) : name of the db
       */

      JSRel.create = function(uniqId, options) {
        options || (options = {});
        delete options.reset;
        options.__create = true;
        return JSRel.use(uniqId, options);
      };


      /*
       * JSRel.$import(uniqId, dbJSONstr, options)
       *
       * Creates instance from saved data
       * - uniqId: the identifier of the instance, used for storing the data to external system(file, localStorage...)
       * - dbJSONstr : data
       * - options:
       *   - force (boolean) : if true, overrides already-existing database.
       *   - storage(string) : type of external storage. one of mock, file, local, session
       *   - autosave (boolean) : if true, save at every action(unstable...)
       *   - name (string) : name of the db
       */

      JSRel.$import = function(uniqId, dbJSONstr, options) {
        var autosave, d, e, key, name, storage, _i, _len, _ref;
        if (options == null) {
          options = {};
        }
        uniqId || err("uniqId is required and must be non-zero value.");
        uniqId = uniqId.toString();
        (options.force || (this._dbInfos[uniqId] == null)) || err("id", quo(uniqId), "already exists");
        try {
          d = JSON.parse(dbJSONstr);
        } catch (_error) {
          e = _error;
          err("Invalid format given to JSRel.$import");
        }
        _ref = ["n", "s", "a", "f", "t"];
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          key = _ref[_i];
          d.hasOwnProperty(key) || err("Invalid Format given.");
        }
        autosave = options.autosave != null ? !!options.autosave : d.a;
        name = options.name != null ? options.name.toString() : d.n;
        storage = options.storage != null ? options.storage.toString() : d.s;
        (JSRel.storages[storage] != null) || err("options.storage must be one of " + Object.keys(JSRel.storages).map(quo).join(","));
        return new JSRel(uniqId, name, storage, autosave, d.f, d.t, true);
      };

      JSRel["import"] = JSRel.$import;

      defineGetters(JSRel.prototype, {
        loaded: function() {
          return this._loaded;
        },
        created: function() {
          return !this._loaded;
        },
        storage: function() {
          return JSRel.storages[this._storage];
        },
        tables: function() {
          return Object.keys(this._tblInfos);
        },
        schema: function() {
          var col, colInfo, colName, columnDescriptions, index, metaKey, table, tableDescriptions, tableName, tblInfo, _i, _j, _len, _len1, _ref, _ref1, _ref2, _ref3;
          tableDescriptions = {};
          _ref = this._tblInfos;
          for (tableName in _ref) {
            tblInfo = _ref[tableName];
            table = this._tblInfos[tableName];
            columnDescriptions = {};
            _ref1 = table.columns;
            for (_i = 0, _len = _ref1.length; _i < _len; _i++) {
              colName = _ref1[_i];
              if (Table.AUTO_ADDED_COLUMNS[colName]) {
                continue;
              }
              colInfo = table._colInfos[colName];
              columnDescriptions[colName] = {
                type: Table.TYPES[colInfo.type],
                required: colInfo.required,
                _default: colInfo._default
              };
            }
            columnDescriptions.$indexes = [];
            columnDescriptions.$uniques = [];
            _ref2 = table._indexes;
            for (col in _ref2) {
              index = _ref2[col];
              if (Table.AUTO_ADDED_COLUMNS[colName]) {
                continue;
              }
              columnDescriptions[(index._unique ? "$uniques" : "$indexes")].push(col.split(","));
            }
            columnDescriptions.$classes = Object.keys(table._classes).map(function(col) {
              return col.split(",");
            });
            _ref3 = Table.COLUMN_META_KEYS;
            for (_j = 0, _len1 = _ref3.length; _j < _len1; _j++) {
              metaKey = _ref3[_j];
              if (columnDescriptions[metaKey].length === 0) {
                delete columnDescriptions[metaKey];
              }
            }
            tableDescriptions[tableName] = columnDescriptions;
          }
          return tableDescriptions;
        }
      });


      /*
       * JSRel#table(tableName)
       * gets table ofject by its name
       */

      JSRel.prototype.table = function(tableName) {
        return this._tblInfos[tableName];
      };


      /*
       * JSRel#save(noCompress)
       */

      JSRel.prototype.save = function(noCompress) {
        var data;
        this._hooks["save:start"] && this._emit("save:start", this.origin());
        data = this.$export(noCompress);
        this.storage.setItem(this.id, data);
        this._emit("save:end", data);
        return this;
      };


      /*
       * JSRel#origin()
       */

      JSRel.prototype.origin = function() {
        return this.storage.getItem(this.id);
      };


      /*
       * JSRel#$export(noCompress)
       */

      JSRel.prototype.$export = function(noCompress) {
        var ret;
        ret = {
          n: this.name,
          s: this._storage,
          a: this._autosave
        };
        ret.t = noCompress ? this._tblInfos : (function(tblData) {
          var t, table, tblName;
          t = {};
          for (tblName in tblData) {
            table = tblData[tblName];
            t[tblName] = table._compress();
          }
          return t;
        })(this._tblInfos);
        ret.f = noCompress ? "Raw" : "Compressed";
        return JSON.stringify(ret);
      };

      JSRel.prototype["export"] = function(noCompress) {
        return this.$export(noCompress);
      };


      /*
       * JSRel#toSQL(options)
       */

      JSRel.prototype.toSQL = function(options) {
        var datetime, dbname, n2s, ret, tables;
        if (options == null) {
          options = {
            type: "mysql",
            engine: "InnoDB"
          };
        }
        if (options.rails) {
          n2s = function(n) {
            return ("000" + n).match(/..$/);
          };
          datetime = function(v) {
            var t;
            t = new Date(v);
            return t.getFullYear() + "-" + n2s(t.getMonth() + 1) + "-" + n2s(t.getDate()) + " " + n2s(t.getHours()) + ":" + n2s(t.getMinutes()) + ":" + n2s(t.getSeconds());
          };
          options.columns || (options.columns = {});
          options.values || (options.values = {});
          options.columns.upd_at = "updated_at";
          options.columns.ins_at = "created_at";
          options.values.upd_at = datetime;
          options.values.ins_at = datetime;
        }
        ret = [];
        if (options.db) {
          dbname = (options.db === true ? this.id : options.db.toString());
          ret.push("CREATE DATABASE `" + dbname + "`;");
          ret.push("USE `" + dbname + "`;");
        }
        tables = this.tables;
        if (!options.noschema && !options.nodrop) {
          ret.push(tables.map(function(tbl) {
            return this.table(tbl)._toDropSQL(options);
          }, this).reverse().join("\n"));
        }
        if (!options.noschema) {
          ret.push(tables.map(function(tbl) {
            return this.table(tbl)._toCreateSQL(options);
          }, this).join("\n"));
        }
        if (!options.nodata) {
          ret.push(tables.map(function(tbl) {
            return this.table(tbl)._toInsertSQL(options);
          }, this).join("\n"));
        }
        return ret.join("\n");
      };


      /*
       * JSRel#on()
       */

      JSRel.prototype.on = function(evtname, fn, options) {
        if (options == null) {
          options = {};
        }
        if (!this._hooks[evtname]) {
          this._hooks[evtname] = [];
        }
        this._hooks[evtname][(options.unshift ? "unshift" : "push")](fn);
      };


      /*
       * JSRel#off()
       */

      JSRel.prototype.off = function(evtname, fn) {
        if (!this._hooks[evtname]) {
          return;
        }
        if (fn == null) {
          return this._hooks[evtname] = null;
        }
        this._hooks[evtname] = this._hooks[evtname].filter(function(f) {
          return fn !== f;
        });
      };


      /*
       * JSRel#drop()
       */

      JSRel.prototype.drop = function() {
        var col, colInfo, id, nonRequiredReferringTables, prop, record, refTable, refTables, refTblName, relTable, relTblName, relname, table, tblName, tblNames, _i, _j, _k, _len, _len1, _len2, _ref, _ref1, _ref2, _ref3;
        tblNames = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
        nonRequiredReferringTables = {};
        for (_i = 0, _len = tblNames.length; _i < _len; _i++) {
          tblName = tblNames[_i];
          table = this._tblInfos[tblName];
          table || err("unknown table name", quo(tblName), "in jsrel#drop");
          _ref = table._referreds;
          for (refTblName in _ref) {
            refTables = _ref[refTblName];
            for (col in refTables) {
              colInfo = refTables[col];
              if (!colInfo) {
                nonRequiredReferringTables[refTblName] = col;
              } else if (__indexOf.call(tblNames, refTblName) < 0) {
                err("table ", quo(tblName), "has its required-referring table", quo(refTblName), ", try jsrel#drop('" + tblName + "', '" + refTblName + "')");
              }
            }
          }
        }
        for (_j = 0, _len1 = tblNames.length; _j < _len1; _j++) {
          tblName = tblNames[_j];
          table = this._tblInfos[tblName];
          _ref1 = table._rels;
          for (relname in _ref1) {
            relTblName = _ref1[relname];
            if (__indexOf.call(tblNames, relTblName) >= 0) {
              continue;
            }
            relTable = this._tblInfos[relTblName];
            delete relTable._referreds[tblName];
          }
          _ref2 = ["_colInfos", "_indexes", "_idxKeys", "_classes", "_data", "_rels", "_referreds"];
          for (_k = 0, _len2 = _ref2.length; _k < _len2; _k++) {
            prop = _ref2[_k];
            delete table[prop];
          }
          delete this._tblInfos[tblName];
        }
        for (refTblName in nonRequiredReferringTables) {
          col = nonRequiredReferringTables[refTblName];
          refTable = this._tblInfos[refTblName];
          _ref3 = refTable._data;
          for (id in _ref3) {
            record = _ref3[id];
            record[col + "_id"] = null;
          }
        }
      };


      /*
       * JSRel#_emit()
       */

      JSRel.prototype._emit = function() {
        var args, evtname, fn, _i, _len, _ref;
        args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
        evtname = args.shift();
        if (!Array.isArray(this._hooks[evtname])) {
          return;
        }
        _ref = this._hooks[evtname];
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          fn = _ref[_i];
          fn.apply(this, args);
        }
      };

      return JSRel;

    })();

    /*
     * public
     * - columns   : list of columns
     * - name      : table name
     * - db        : id of the parent JSRel (externally set)
     * 
     * private
     * - _colInfos  : { colName => column Info object }
     * - _indexes   : { columns => sorted list }
     * - _idxKeys   : { column  => list of idx column sets}
     * - _classes   : { columns => classes hash object}
     * - _data      : { id      => record }
     * - _rels      : { RelName => related table name }
     * - _referreds : { referring table name => { column => required or not} } (externally set)
     */
    Table = (function() {

      /*
       * class properties
       */
      defineConstants(Table, {
        _BOOL: 1,
        _NUM: 2,
        _STR: 3,
        _INT: 4,
        _CHRS: 5,
        _CHR2: 6,
        TYPES: {
          1: "boolean",
          2: "number",
          3: "string",
          4: "number",
          5: "string",
          6: "string"
        },
        TYPE_SQLS: {
          1: "tinyint(1)",
          2: "double",
          3: "text",
          4: "int",
          5: "varchar(255)",
          6: "varchar(160)"
        },
        INVALID_COLUMNS: ["id", "ins_at", "upd_at", "on", "off", "str", "num", "bool", "int", "float", "text", "chars", "double", "string", "number", "boolean", "order", "limit", "offset", "join", "where", "as", "select", "explain"],
        COLKEYS: ["name", "type", "required", "_default", "rel", "sqltype"],
        COLUMN_META_KEYS: ["$indexes", "$uniques", "$classes"],
        AUTO_ADDED_COLUMNS: {
          id: true,
          ins_at: true,
          upd_at: true
        },
        NOINDEX_MIN_LIMIT: 100,
        ID_TEMP: 0,
        CLASS_EXISTING_VALUE: 1
      });


      /*
       * constructor
       * 
       * arguments
       * name    : (string) table name
       * db      : (JSRel)
       * colData : table information
       * format  : format of tblData to parse (one of Raw, Schema, Compressed)
       *
       */

      function Table(name, db, colData, format) {
        var col, colOrder, columns, k, _i, _len;
        defineConstants(this, {
          name: name,
          db: db
        });
        this._colInfos = {};
        this._data = {};
        this._indexes = {};
        this._idxKeys = {};
        this._classes = {};
        this._rels = {};
        this._referreds = {};
        (typeof this["_parse" + format] === "function") || err("unknown format", quo(format), "given in", quo(this.db.id));
        this["_parse" + format](colData);
        columns = Object.keys(this._colInfos).sort();
        colOrder = {};
        for (k = _i = 0, _len = columns.length; _i < _len; k = ++_i) {
          col = columns[k];
          colOrder[col] = k;
        }
        defineConstants(this, {
          columns: columns,
          colOrder: colOrder
        });
      }


      /*
       * Table#ins()
       */

      Table.prototype.ins = function(argObj, options) {
        var cls, col, cols, columns, e, exId, exObj, exTable, exTblName, idcol, idxName, insObj, insertObjs, referred, relObj, relTable, relTblName, relatedObjs, required, sortedList, values, _i, _j, _k, _len, _len1, _len2, _ref, _ref1, _ref2, _ref3, _ref4;
        if (options == null) {
          options = {};
        }
        if (!(argObj && typeof argObj === "object")) {
          err("You must pass object to table.ins().");
        }
        this._convertRelObj(argObj);
        if (!options.force) {
          for (col in Table.AUTO_ADDED_COLUMNS) {
            delete argObj[col];
          }
        } else {
          for (col in Table.AUTO_ADDED_COLUMNS) {
            if (col in argObj) {
              argObj[col] = Number(argObj[col]);
            }
          }
        }
        insObj = {};
        _ref = this.columns;
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          col = _ref[_i];
          insObj[col] = argObj[col];
          this._cast(col, insObj);
        }
        _ref1 = this._rels;
        for (col in _ref1) {
          relTblName = _ref1[col];
          idcol = col + "_id";
          exId = insObj[idcol];
          relTable = this.db.table(relTblName);
          required = this._colInfos[idcol].required;
          if (!required && (exId == null)) {
            continue;
          }
          exObj = relTable.one(exId);
          if (!required && (exObj == null)) {
            insObj[idcol] = null;
          } else if (exObj === null) {
            err("invalid external id", quo(idcol), ":", exId);
          }
        }
        if (insObj.id != null) {
          if (this._data[insObj.id] != null) {
            err("the given id \"", insObj.id, "\" already exists.");
          }
          if (insObj.id === Table.ID_TEMP) {
            err("id cannot be", Table.ID_TEMP);
          }
        } else {
          insObj.id = this._getNewId();
        }
        if (insObj.ins_at == null) {
          insObj.ins_at = new Date().getTime();
        }
        if (insObj.upd_at == null) {
          insObj.upd_at = insObj.ins_at;
        }
        this._data[insObj.id] = insObj;
        try {
          for (idxName in this._indexes) {
            this._checkUnique(idxName, insObj);
          }
        } catch (_error) {
          e = _error;
          delete this._data[insObj.id];
          throw e;
          return null;
        }
        _ref2 = this._indexes;
        for (idxName in _ref2) {
          sortedList = _ref2[idxName];
          sortedList.insert(insObj.id);
        }
        _ref3 = this._classes;
        for (columns in _ref3) {
          cls = _ref3[columns];
          values = columns.split(",").map(function(col) {
            return insObj[col];
          }).join(",");
          if (!cls[values]) {
            cls[values] = {};
          }
          cls[values][insObj.id] = Table.CLASS_EXISTING_VALUE;
        }
        this.db._hooks["ins"] && this.db._emit("ins", this.name, insObj);
        this.db._hooks["ins:" + this.name] && this.db._emit("ins:" + this.name, insObj);
        _ref4 = this._referreds;
        for (exTblName in _ref4) {
          referred = _ref4[exTblName];
          cols = Object.keys(referred);
          insertObjs = {};
          if (cols.length === 1) {
            relatedObjs = argObj[exTblName] || argObj[exTblName + "." + cols[0]];
            if (relatedObjs) {
              insertObjs[cols[0]] = Array.isArray(relatedObjs) ? relatedObjs : [relatedObjs];
            }
          } else {
            for (_j = 0, _len1 = cols.length; _j < _len1; _j++) {
              col = cols[_j];
              relatedObjs = argObj[exTblName + "." + col];
              if (relatedObjs) {
                insertObjs[col] = Array.isArray(relatedObjs) ? relatedObjs : [relatedObjs];
              }
            }
          }
          for (col in insertObjs) {
            relatedObjs = insertObjs[col];
            exTable = this.db.table(exTblName);
            for (_k = 0, _len2 = relatedObjs.length; _k < _len2; _k++) {
              relObj = relatedObjs[_k];
              relObj[col + "_id"] = insObj.id;
              exTable.ins(relObj);
            }
          }
        }
        if (this.db._autosave) {
          this.db.save();
        }
        return copy(insObj);
      };


      /*
       * Table#upd()
       */

      Table.prototype.upd = function(argObj, options) {
        var cls, clsCol, col, cols, columns, e, exId, exObj, exTable, exTblName, idcol, idhash, idxName, idxNames, list, newval, oldId, oldIds, oldObj, oldval, position, query, referred, relTblName, relatedObj, relatedObjs, required, toUpdate, updCol, updCols, updIndexPoses, updObj, updVal, updateObjs, _i, _j, _k, _l, _len, _len1, _len10, _len11, _len12, _len2, _len3, _len4, _len5, _len6, _len7, _len8, _len9, _m, _n, _o, _p, _q, _r, _ref, _ref1, _ref2, _ref3, _s, _t, _u;
        if (options == null) {
          options = {};
        }
        if (argObj === null || argObj.id === null || argObj.id === Table.ID_TEMP) {
          err("id is not found in the given object.");
        }
        argObj.id = Number(argObj.id);
        oldObj = this._data[argObj.id];
        if (oldObj === null) {
          err("Cannot update. Object not found in table", this.name, "with given id", argObj.id);
        }
        if (!options.force) {
          delete argObj.ins_at;
          delete argObj.upd_at;
        } else {
          if ("ins_at" in argObj) {
            argObj.ins_at = Number(argObj.ins_at);
          }
          argObj.upd_at = new Date().getTime();
        }
        this._convertRelObj(argObj);
        updObj = {
          id: argObj.id
        };
        updCols = [];
        _ref = this.columns;
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          col = _ref[_i];
          if (argObj.hasOwnProperty(col)) {
            updVal = argObj[col];
            updObj[col] = updVal;
            if (updVal !== oldObj[col]) {
              updCols.push(col);
            }
            this._cast(col, argObj);
          } else {
            updObj[col] = oldObj[col];
          }
        }
        for (_j = 0, _len1 = updCols.length; _j < _len1; _j++) {
          updCol = updCols[_j];
          relTblName = this._rels[updCol];
          if (!relTblName) {
            continue;
          }
          idcol = updCol + "_id";
          if (idcol in updObj) {
            exId = updObj[idcol];
            required = this._colInfos[idcol].required;
            if (!required && (exId == null)) {
              continue;
            }
            exObj = this.db.one(relTblName, exId);
            if (!required && (exObj == null)) {
              updObj[idcol] = null;
            } else if (exObj === null) {
              err("invalid external id", quo(idcol), ":", exId);
            }
          }
        }
        updIndexPoses = {};
        for (_k = 0, _len2 = updCols.length; _k < _len2; _k++) {
          updCol = updCols[_k];
          idxNames = this._idxKeys[updCol];
          if (!idxNames) {
            continue;
          }
          for (_l = 0, _len3 = idxNames.length; _l < _len3; _l++) {
            idxName = idxNames[_l];
            list = this._indexes[idxName];
            _ref1 = list.keys(updObj.id);
            for (_m = 0, _len4 = _ref1.length; _m < _len4; _m++) {
              position = _ref1[_m];
              if (list[position] === updObj.id) {
                updIndexPoses[idxName] = position;
                list.remove(position);
                break;
              }
            }
          }
        }
        this._data[argObj.id] = updObj;
        try {
          for (_n = 0, _len5 = updCols.length; _n < _len5; _n++) {
            updCol = updCols[_n];
            idxNames = this._idxKeys[updCol];
            if (!idxNames) {
              continue;
            }
            for (_o = 0, _len6 = idxNames.length; _o < _len6; _o++) {
              idxName = idxNames[_o];
              this._checkUnique(idxName, updObj);
            }
          }
        } catch (_error) {
          e = _error;
          this._data[argObj.id] = oldObj;
          for (idxName in updIndexPoses) {
            this._indexes[idxName].insert(oldObj.id);
          }
          throw e;
        }
        for (idxName in updIndexPoses) {
          this._indexes[idxName].insert(argObj.id);
        }
        _ref2 = this._classes;
        for (columns in _ref2) {
          cls = _ref2[columns];
          cols = columns.split(",");
          toUpdate = false;
          for (_p = 0, _len7 = cols.length; _p < _len7; _p++) {
            clsCol = cols[_p];
            if (__indexOf.call(updCols, clsCol) >= 0) {
              toUpdate = true;
            }
          }
          if (!toUpdate) {
            continue;
          }
          oldval = cols.map(function(col) {
            return oldObj[col];
          }).join(",");
          newval = cols.map(function(col) {
            return updObj[col];
          }).join(",");
          delete cls[oldval][updObj.id];
          if (Object.keys(cls[oldval]).length === 0) {
            delete cls[oldval];
          }
          if (cls[newval] == null) {
            cls[newval] = {};
          }
          cls[newval][updObj.id] = Table.CLASS_EXISTING_VALUE;
        }
        this.db._hooks["upd"] && this.db._emit("upd", this.name, updObj, oldObj, updCols);
        this.db._hooks["upd:" + this.name] && this.db._emit("upd:" + this.name, updObj, oldObj, updCols);
        _ref3 = this._referreds;
        for (exTblName in _ref3) {
          referred = _ref3[exTblName];
          cols = Object.keys(referred);
          updateObjs = {};
          if (cols.length === 1) {
            relatedObjs = argObj[exTblName] || argObj[exTblName + "." + cols[0]];
            if (relatedObjs) {
              updateObjs[cols[0]] = Array.isArray(relatedObjs) ? relatedObjs : [relatedObjs];
            }
          } else {
            for (_q = 0, _len8 = cols.length; _q < _len8; _q++) {
              col = cols[_q];
              relatedObjs = argObj[exTblName + "." + col];
              if (relatedObjs) {
                updateObjs[col] = Array.isArray(relatedObjs) ? relatedObjs : [relatedObjs];
              }
            }
          }
          for (col in updateObjs) {
            relatedObjs = updateObjs[col];
            idhash = {};
            for (_r = 0, _len9 = relatedObjs.length; _r < _len9; _r++) {
              relatedObj = relatedObjs[_r];
              if (relatedObj.id) {
                idhash[relatedObj.id] = relatedObj;
              }
            }
            query = {};
            query[col + "_id"] = updObj.id;
            exTable = this.db.table(exTblName);
            oldIds = exTable.find(query, {
              select: "id"
            });
            if (!options.append) {
              for (_s = 0, _len10 = oldIds.length; _s < _len10; _s++) {
                oldId = oldIds[_s];
                if (!idhash[oldId]) {
                  exTable.del(oldId);
                }
              }
            }
            for (_t = 0, _len11 = oldIds.length; _t < _len11; _t++) {
              oldId = oldIds[_t];
              if (idhash[oldId]) {
                exTable.upd(idhash[oldId]);
              }
            }
            for (_u = 0, _len12 = relatedObjs.length; _u < _len12; _u++) {
              relatedObj = relatedObjs[_u];
              if (relatedObj.id) {
                continue;
              }
              relatedObj[col + "_id"] = updObj.id;
              exTable.ins(relatedObj);
            }
          }
        }
        if (this.db._autosave) {
          this.db.save();
        }
        return updObj;
      };


      /*
       * Table#upd()
       */

      Table.prototype.find = function(query, options, _priv) {
        var joinCols, joinInfos, joins, keyColumn, keys, report, reqCols, res, ret;
        if (options == null) {
          options = {};
        }
        if (_priv == null) {
          _priv = {};
        }
        report = Table._buildReportObj(options.explain);
        keys = this._indexes.id;
        query = (_priv.normalized ? query : Table._normalizeQuery(query));
        if (query) {
          keys = cup(query.map(function(condsList) {
            var ks;
            ks = null;
            Object.keys(condsList).forEach((function(column) {
              ks = cup(condsList[column].map(function(cond) {
                var localKeys;
                localKeys = (ks ? ks.slice() : null);
                Object.keys(cond).forEach((function(condType) {
                  localKeys = this._optSearch(column, condType, cond[condType], localKeys, report);
                }), this);
                return localKeys;
              }, this));
            }), this);
            return ks;
          }, this));
        } else {
          if (report) {
            report.searches.push({
              searchType: "none"
            });
          }
        }
        joins = null;
        joinCols = null;
        if (options.join) {
          joinInfos = this._getJoinInfos(options.join);
          joins = {};
          joinCols = [];
          reqCols = [];
          joinInfos.N.forEach((function(info) {
            var idcol, name, tblObj;
            report && Table._reportSubQuery(report, info, "1:N");
            idcol = info.col;
            name = info.name;
            tblObj = this.db.table(info.tbl);
            joinCols.push(name);
            if (info.req) {
              reqCols.push(name);
            }
            if (info.emptyArray) {
              keys.forEach(function(id) {
                if (!joins[id]) {
                  joins[id] = {};
                }
                if (!joins[id][name]) {
                  joins[id][name] = [];
                }
              });
            }
            tblObj.find(info.query, info.options, {
              usedTables: _priv.usedTables
            }).forEach(function(result) {
              var id;
              id = result[idcol];
              if (!joins[id]) {
                joins[id] = {};
              }
              if (!joins[id][name]) {
                joins[id][name] = [];
              }
              joins[id][name].push(result);
            });
            if ((info.offset != null) || (info.limit != null)) {
              Object.keys(joins).forEach(function(id) {
                var arr;
                arr = joins[id][name];
                if (arr) {
                  joins[id][name] = Table._offsetLimit(arr, info.offset, info.limit);
                }
              });
            }
            if (info.select) {
              if (typeof info.select === "string") {
                Object.keys(joins).forEach(function(id) {
                  var arr;
                  arr = joins[id][name];
                  if (arr) {
                    joins[id][name] = joins[id][name].map(function(v) {
                      return v[info.select];
                    });
                  }
                });
              } else {
                (Array.isArray(info.select)) || err("typeof options.select must be one of string, null, array");
                Object.keys(joins).forEach(function(id) {
                  var arr;
                  arr = joins[id][name];
                  if (arr) {
                    joins[id][name] = join[id][name].map(function(v) {
                      return info.select.reduce((function(ret, k) {
                        ret[k] = v[k];
                        return ret;
                      }), {});
                    });
                  }
                });
              }
            }
          }), this);
          joinInfos[1].forEach((function(info) {
            var idcol, name, q, tblObj;
            report && Table._reportSubQuery(report, info, "N:1");
            idcol = info.col;
            name = info.name;
            tblObj = this.db.table(info.tbl);
            q = Table._normalizeQuery(info.query);
            joinCols.push(name);
            if (info.req) {
              reqCols.push(name);
            }
            keys.forEach((function(id) {
              var exId;
              exId = tblObj._survive(this._data[id][idcol], q, true);
              if (exId == null) {
                return;
              }
              if (!joins[id]) {
                joins[id] = {};
              }
              joins[id][name] = tblObj._data[exId];
            }), this);
          }), this);
          keys = keys.filter(function(id) {
            var joinColObj;
            joinColObj = joins[id];
            if (!joinColObj) {
              joinColObj = {};
            }
            return reqCols.every(function(col) {
              return joinColObj[col];
            });
          }, this);
        }
        keys = this._orderBy(keys, options.order, report);
        keys = Table._offsetLimit(keys, options.offset, options.limit);
        res = this._select(keys, options.select, joins, joinCols);
        if (!options.groupBy) {
          return res;
        }
        ret = {};
        keyColumn = (options.groupBy === true ? "id" : options.key);
        res.forEach(function(item) {
          ret[item[keyColumn]] = item;
        });
        return ret;
      };

      return Table;

    })();
    JSRel.Table = Table;
    Table.prototype.one = function(query, options, _priv) {
      var ret;
      if (typeof query === "number" || !isNaN(Number(query))) {
        query = {
          id: query
        };
      }
      ret = this.find(query, options, _priv);
      if (ret.length) {
        return ret[0];
      } else {
        return null;
      }
    };
    Table.prototype.count = function(query) {
      if (!query) {
        return this._indexes.id.length;
      }
      return this.find(query, {
        select: "id"
      }).length;
    };
    Table.prototype.del = function(arg, options) {
      var delList;
      options || (options = {});
      delList = void 0;
      if (typeof arg === "number") {
        this._data[arg] || err("id", arg, "is not found in table", this.name);
        delList = [this._data[arg]];
      } else {
        delList = this.find(arg);
      }
      delList.forEach((function(obj) {
        Object.keys(this._indexes).forEach((function(idxName) {
          var bool, keys, list;
          list = this._indexes[idxName];
          keys = list.keys(obj.id);
          (keys != null) || err("invalid keys");
          bool = keys.some(function(key) {
            if (obj.id === list[key]) {
              list.remove(key);
              return true;
            }
          });
          bool || err("index was not deleted.");
        }), this);
        Object.keys(this._classes).forEach((function(columns) {
          var cls, cols, val;
          cls = this._classes[columns];
          cols = columns.split(",");
          val = cols.map(function(col) {
            return obj[col];
          });
          (cls[val][obj.id] === Table.CLASS_EXISTING_VALUE) || err("deleting object is not in classes.", quo(obj.id), "in table", quo(this.name));
          delete cls[val][obj.id];
          if (Object.keys(cls[val]).length === 0) {
            delete cls[val];
          }
        }), this);
        delete this._data[obj.id];
        this.db._emit("del", this.name, obj);
        this.db._emit("del:" + this.name, obj);
        Object.keys(this._referreds).forEach((function(exTable) {
          var info, query;
          query = {};
          info = this._referreds[exTable];
          Object.keys(info).forEach((function(colName) {
            var required, upd;
            required = info[colName];
            query[colName + "_id"] = obj.id;
            if (required) {
              this.db.table(exTable).del(query, {
                sub: true
              });
            } else {
              upd = {};
              upd[colName + "_id"] = null;
              this.db.table(exTable).find(query).forEach((function(o) {
                upd.id = o.id;
                this.db.table(exTable).upd(upd, {
                  sub: true
                });
              }), this);
            }
          }), this);
        }), this);
      }), this);
      if (this.db._autosave) {
        this.db.save();
      }
      return this;
    };
    Table.prototype._getNewId = function() {
      var len;
      len = this._indexes.id.length;
      if (!len) {
        return 1;
      }
      return this._indexes.id[len - 1] + 1;
    };
    Table.prototype._optSearch = function(col, condType, value, ids, report) {
      var lists, result, ret, searchType;
      this._colInfos[col] || err("unknown column", quo(col));
      lists = {
        index: this._indexes[col],
        classes: this._classes[col],
        noIndex: ids
      };
      searchType = void 0;
      if ((ids && ids.length < Table.NOINDEX_MIN_LIMIT) || (!lists.index && !lists.classes) || condType === "like") {
        searchType = "noIndex";
      } else {
        switch (condType) {
          case "equal":
          case "$in":
            searchType = (lists.classes ? "classes" : "index");
            break;
          case "gt":
          case "ge":
          case "lt":
          case "le":
            searchType = (lists.index ? "index" : "classes");
            break;
          case "like$":
            searchType = (lists.index ? "index" : "noIndex");
            break;
          default:
            err("undefined condition", quo(condType));
        }
      }
      result = Queries[searchType][condType].call(this, col, value, lists[searchType] || this._indexes.id);
      ret = (searchType === "noIndex" || !ids ? result : conjunction(ids, result));
      if (report) {
        report.searches.push({
          searchType: searchType,
          condition: condType,
          column: col,
          value: value,
          count: result.length,
          before: (ids ? ids.length : null),
          after: ret.length
        });
      }
      return ret;
    };
    Table.prototype._idxSearch = function(list, obj, fn, nocopy) {
      var ob, ret;
      ob = (nocopy ? obj : copy(obj));
      if (ob.id == null) {
        ob.id = Table.ID_TEMP;
      }
      this._data[Table.ID_TEMP] = ob;
      ret = fn.call(this, ob, this._data);
      delete this._data[Table.ID_TEMP];
      return ret;
    };
    Table.prototype._idxSearchByValue = function(list, col, value, fn) {
      var obj;
      obj = {};
      obj[col] = value;
      return this._idxSearch(list, obj, fn, true);
    };
    Table.prototype._convertRelObj = function(obj) {
      Object.keys(this._rels).forEach(function(col) {
        if (obj[col + "_id"] != null) {
          return;
        }
        if (obj[col] && (obj[col].id != null)) {
          obj[col + "_id"] = obj[col].id;
          delete obj[col];
        }
      });
      return obj;
    };
    Table.prototype._cast = function(colName, obj) {
      var colInfo, val;
      val = obj[colName];
      if (Table.AUTO_ADDED_COLUMNS[colName] && (val == null)) {
        return;
      }
      colInfo = this._colInfos[colName];
      if (typeof val === Table.TYPES[colInfo.type]) {
        return;
      }
      if (!colInfo.required && (val == null)) {
        val = colInfo._default;
      } else {
        (val != null) || err("column", "\"" + colName + "\"", "is required.");
        switch (colInfo.type) {
          case Table._NUM:
            val = Number(val);
            (!isNaN(val)) || err(quo(colName), ":", quo(obj[colName]), "is not a valid number.");
            break;
          case Table._BOOL:
            val = !!val;
            break;
          case Table._STR:
            (typeof val.toString === "function") || err("cannot convert", val, "to string");
            val = val.toString();
        }
      }
      obj[colName] = val;
      return obj;
    };
    Table.prototype._checkUnique = function(idxName, obj) {
      var list;
      list = this._indexes[idxName];
      if (!list._unique) {
        return;
      }
      this._idxSearch(list, obj, function(tmpObj, data) {
        (!(list.key(tmpObj.id) != null)) || err("duplicated entry :", idxName.split(",").map(function(col) {
          return obj[col];
        }).join(","), "in", idxName);
      });
    };
    Table.prototype._compress = function() {
      var cClasses, cData, cRels;
      cData = Table._compressData(this._colInfos, this._data, this._indexes, this._idxKeys);
      cClasses = Table._compressClasses(this._classes);
      cRels = Table._compressRels(this._rels, this._referreds);
      return [cData, cClasses, cRels];
    };
    Table._compressData = function(colInfos, data, indexes, idxKeys) {
      var boolTypes, cols, compressedColInfos, compressedData, compressedIndexes;
      cols = [];
      compressedColInfos = Object.keys(colInfos).map(function(col) {
        var colInfo;
        colInfo = colInfos[col];
        cols.push(colInfo.name);
        return Table.COLKEYS.map(function(key) {
          return colInfo[key];
        });
      }, this);
      boolTypes = cols.reduce(function(ret, col) {
        if (colInfos[col].type === Table._BOOL) {
          ret[col] = 1;
        }
        return ret;
      }, {});
      compressedData = Object.keys(data).map(function(id) {
        var obj;
        obj = data[id];
        return cols.map(function(col) {
          if (boolTypes[col]) {
            if (obj[col]) {
              return 1;
            } else {
              return 0;
            }
          } else {
            return obj[col];
          }
        });
      }, this);
      compressedIndexes = Object.keys(indexes).map(function(idxName) {
        var list;
        list = indexes[idxName];
        return [idxName, list._unique, list.toArray()];
      });
      return [compressedColInfos, compressedData, compressedIndexes];
    };
    Table._decompressData = function(cdata) {
      var boolTypes, cIndexes, colInfos, cols, darr, data, idxKeys, indexes, infos;
      infos = cdata[0];
      darr = cdata[1];
      cIndexes = cdata[2];
      colInfos = {};
      cols = infos.map(function(info, k) {
        var col, obj;
        obj = {};
        Table.COLKEYS.forEach(function(colkey, n) {
          obj[colkey] = info[n];
        });
        col = obj.name;
        colInfos[col] = obj;
        return col;
      });
      boolTypes = cols.reduce(function(ret, col) {
        if (colInfos[col].type === Table._BOOL) {
          ret[col] = 1;
        }
        return ret;
      }, {});
      data = darr.reduce(function(ret, d, k) {
        var record;
        record = {};
        cols.forEach(function(col, k) {
          record[col] = (boolTypes[col] ? !!d[k] : d[k]);
        });
        ret[record.id] = record;
        return ret;
      }, {});
      indexes = cIndexes.reduce(function(indexes, nameUniqArr) {
        var arr, columns, idxName, types, uniq;
        idxName = nameUniqArr[0];
        columns = idxName.split(",");
        uniq = nameUniqArr[1];
        types = columns.map(function(col) {
          return colInfos[col].type;
        });
        arr = nameUniqArr[2];
        indexes[idxName] = Table._getIndex(columns, uniq, types, arr, data);
        return indexes;
      }, {});
      idxKeys = Table._getIdxKeys(indexes);
      return [colInfos, data, indexes, idxKeys];
    };
    Table._compressClasses = function(classes) {
      return Object.keys(classes).map(function(col) {
        var cls, cols, vals;
        cls = classes[col];
        cols = cls.cols;
        delete cls.cols;
        vals = Object.keys(cls).map(function(val) {
          return [
            val, Object.keys(cls[val]).map(function(v) {
              return Number(v);
            })
          ];
        });
        cls.cols = cols;
        return [col, vals];
      });
    };
    Table._decompressClasses = function(cClasses) {
      return cClasses.reduce((function(classes, colvals) {
        var col;
        col = colvals[0];
        classes[col] = colvals[1].reduce(function(cls, valkeys) {
          var val;
          val = valkeys[0];
          cls[val] = valkeys[1].reduce(function(idhash, id) {
            idhash[id] = 1;
            return idhash;
          }, {});
          return cls;
        }, {});
        classes[col].cols = col.split(",");
        return classes;
      }), {});
    };
    Table._compressRels = function(rels, referreds) {
      return [rels, referreds];
    };
    Table._decompressRels = function(c) {
      return c;
    };
    Table._columnToSQL = function(info, colConverts) {
      var colType, defa, name, stmt;
      colType = Table.TYPE_SQLS[info.sqltype];
      name = (info.name in colConverts ? colConverts[info.name] : info.name);
      stmt = [bq(name), colType];
      if (info.required) {
        stmt.push("NOT NULL");
      }
      if (info._default != null) {
        defa = (info.type === Table._BOOL ? (info._default ? 1 : 0) : (info.type === Table._STR ? quo(info._default) : info._default));
        stmt.push("DEFAULT", defa);
      }
      if (name === "id") {
        stmt.push("PRIMARY KEY AUTO_INCREMENT");
      }
      return stmt.join(" ");
    };
    Table._idxToSQL = function(name, list, colConverts) {
      var uniq;
      if (name === "id") {
        return;
      }
      if (name in colConverts) {
        name = colConverts[name];
      }
      uniq = (list._unique ? "UNIQUE " : "");
      return [uniq + "INDEX", "(" + name + ")"].join(" ");
    };
    Table.prototype._toDropSQL = function(options) {
      var ifExist;
      ifExist = true;
      return "DROP TABLE " + (ifExist ? "IF EXISTS " : "") + bq(this.name) + ";";
    };
    Table.prototype._toCreateSQL = function(options) {
      var colConverts, substmts;
      options || (options = {});
      colConverts = options.columns || {};
      delete colConverts.id;
      substmts = this.columns.map(function(col) {
        return Table._columnToSQL(this._colInfos[col], colConverts);
      }, this);
      Object.keys(this._indexes).forEach((function(idxName) {
        var idxSQL;
        idxSQL = Table._idxToSQL(idxName, this._indexes[idxName], colConverts);
        if (idxSQL) {
          substmts.push(idxSQL);
        }
      }), this);
      Object.keys(this._rels).forEach((function(fkey) {
        var exTbl, fkey_disp, required, stmt;
        exTbl = this._rels[fkey];
        fkey_disp = (fkey in colConverts ? colConverts[fkey] : fkey + "_id");
        stmt = "FOREIGN KEY (" + fkey_disp + ") REFERENCES " + exTbl + "(id)";
        required = this.db.table(exTbl)._referreds[this.name][fkey];
        if (required) {
          stmt += " ON UPDATE CASCADE ON DELETE CASCADE";
        } else {
          stmt += " ON UPDATE NO ACTION ON DELETE SET NULL";
        }
        substmts.push(stmt);
      }), this);
      return "CREATE TABLE " + bq(this.name) + "(" + substmts.join(",") + ")" + (options.type === "mysql" && options.engine ? " ENGINE=" + options.engine : "") + ";";
    };
    Table.prototype._toInsertSQL = function(options) {
      var boolTypes, colConverts, colInfos, columnNames, cur, i, id, l, record, ret, stmt, valConverts, vals;
      options || (options = {});
      colConverts = options.columns || {};
      delete colConverts.id;
      colInfos = this._colInfos;
      boolTypes = this.columns.reduce(function(ret, col) {
        if (colInfos[col].type === Table._BOOL) {
          ret[col] = 1;
        }
        return ret;
      }, {});
      columnNames = this.columns.map(function(name) {
        if (name in colConverts) {
          return colConverts[name];
        } else {
          return name;
        }
      });
      valConverts = options.values || {};
      Object.keys(valConverts).forEach(function(col) {
        if (typeof valConverts[col] !== "function") {
          delete valConverts[col];
        }
      });
      stmt = ["INSERT INTO ", bq(this.name), "(", columnNames.map(bq).join(","), ") VALUES "].join(" ");
      ret = [];
      cur = void 0;
      i = 0;
      l = this._indexes.id.length;
      while (i < l) {
        id = this._indexes.id[i];
        record = this._data[id];
        vals = this.columns.map(function(col) {
          var v;
          v = record[col];
          if (col in valConverts) {
            v = valConverts[col](v);
          }
          if (boolTypes[col]) {
            if (v) {
              return 1;
            } else {
              return 0;
            }
          } else {
            if (typeof v === "number") {
              return v;
            } else {
              return quo(v);
            }
          }
        }).join(",");
        if (i % 1000 === 0) {
          if (cur) {
            ret.push(cur);
          }
          cur = {
            st: stmt,
            ar: []
          };
        }
        cur.ar.push("(" + vals + ")");
        i++;
      }
      if (cur && cur.ar.length) {
        ret.push(cur);
      }
      return ret.map(function(cur) {
        return cur.st + cur.ar.join(",\n") + ";\n";
      }).join("\n");
    };
    Table.prototype._parseRaw = function(info) {
      var indexes;
      indexes = info._indexes;
      delete info._indexes;
      Object.keys(info).forEach((function(k) {
        this[k] = info[k];
      }), this);
      Object.keys(indexes).forEach((function(idxName) {
        var ids, isUniq;
        ids = indexes[idxName];
        isUniq = ids._unique;
        this._setIndex(idxName.split(","), isUniq, Array.prototype.slice.call(ids));
      }), this);
      return this;
    };
    Table.prototype._parseCompressed = function(c) {
      var colInfoDataIdxesKeys, relsReferreds;
      colInfoDataIdxesKeys = Table._decompressData(c[0]);
      this._colInfos = colInfoDataIdxesKeys[0];
      this._data = colInfoDataIdxesKeys[1];
      this._indexes = colInfoDataIdxesKeys[2];
      this._idxKeys = colInfoDataIdxesKeys[3];
      this._classes = Table._decompressClasses(c[1]);
      relsReferreds = Table._decompressRels(c[2]);
      this._rels = relsReferreds[0];
      this._referreds = relsReferreds[1];
    };
    Table.prototype._parseSchema = function(colData) {
      var columnNames, invalidColumn, metaInfos, tblName, _i, _len, _ref;
      colData = copy(colData);
      tblName = this.name;
      _ref = Table.INVALID_COLUMNS;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        invalidColumn = _ref[_i];
        if (colData[invalidColumn] != null) {
          err(invalidColumn, "is not allowed for a column name");
        }
      }
      metaInfos = Table.COLUMN_META_KEYS.reduce(function(ret, k) {
        ret[k] = arrayize(colData[k], true);
        delete colData[k];
        return ret;
      }, {});
      colData.id = 1;
      colData.upd_at = 1;
      colData.ins_at = 1;
      metaInfos.$uniques.unshift("id");
      metaInfos.$indexes.unshift("upd_at", "ins_at");
      columnNames = Object.keys(colData);
      columnNames.forEach(function(col) {
        (!(col.match(/[,.`"']/) != null)) || err("comma, dot and quotations cannot be included in a column name.");
      });
      (columnNames.length > 3) || err("table", quo(tblName), "must contain at least one column.");
      columnNames.forEach((function(colName) {
        var parsed;
        parsed = this.__parseColumn(colName, colData[colName]);
        (!(this._colInfos[parsed.name] != null)) || err(quo(parsed.name), "is already registered.");
        this._colInfos[parsed.name] = parsed;
      }), this);
      Object.keys(this._colInfos).forEach((function(colName) {
        var col, colInfo, exTable, exTblName;
        colInfo = this._colInfos[colName];
        exTblName = colInfo.rel;
        if (!exTblName) {
          return;
        }
        (colName.slice(-3) === "_id") || err("Relation columns must end with \"_id\".");
        exTable = this.db.table(exTblName);
        exTable || err("Invalid relation: ", quo(exTblName), "is an undefined table in", quo(tblName));
        metaInfos.$indexes.push(colName);
        col = colName.slice(0, -3);
        this._rels[col] = exTblName;
        if (!exTable._referreds[tblName]) {
          exTable._referreds[tblName] = {};
        }
        exTable._referreds[tblName][col] = this._colInfos[colName].required;
      }), this);
      Object.keys(metaInfos).forEach((function(k) {
        metaInfos[k] = this._normalizeIndexes(metaInfos[k]);
      }), this);
      metaInfos.$indexes.forEach((function(cols) {
        this._setIndex(cols, false);
      }), this);
      metaInfos.$uniques.forEach((function(cols) {
        this._setIndex(cols, true);
      }), this);
      metaInfos.$classes.forEach((function(cols) {
        this._setClass(cols);
      }), this);
      this._idxKeys = Table._getIdxKeys(this._indexes);
    };
    Table.prototype._setIndex = function(cols, isUniq, ids) {
      var idxName, len, strCols, types;
      strCols = [];
      types = cols.map(function(col) {
        var ret;
        ret = this._colInfos[col].type;
        if (ret === Table._STR) {
          strCols.push(col);
        }
        return ret;
      }, this);
      len = strCols.length;
      strCols.forEach((function(col) {
        this._colInfos[col].sqltype = (len > 1 ? Table._CHR2 : Table._CHRS);
      }), this);
      idxName = cols.join(",");
      if (this._indexes[idxName] != null) {
        return;
      }
      this._indexes[idxName] = Table._getIndex(cols, isUniq, types, ids, this._data);
    };
    Table._getIndex = function(cols, isUniq, types, ids, data) {
      return SortedList.create({
        compare: generateCompare(types, cols, data),
        unique: !!isUniq,
        resume: true
      }, ids);
    };
    Table._getIdxKeys = function(indexes) {
      return Object.keys(indexes).reduce((function(ret, idxName) {
        idxName.split(",").forEach(function(col) {
          if (!ret[col]) {
            ret[col] = [];
          }
          ret[col].push(idxName);
        });
        return ret;
      }), {});
    };
    Table.prototype._setClass = function(cols) {
      var idxname;
      idxname = cols.join(",");
      if (this._classes[idxname] != null) {
        return;
      }
      cols.forEach((function(col) {
        (this._colInfos[col].type !== Table._STR) || err("Cannot set class index to string columns", quo(col));
      }), this);
      this._classes[idxname] = {
        cols: cols
      };
    };
    Table.prototype._getJoinInfos = function(join) {
      var joinInfos, k, __j;
      if (join === true) {
        __j = {};
        Object.keys(this._rels).forEach(function(col) {
          __j[col] = true;
        });
        join = __j;
      } else if (typeof join === "string") {
        k = join;
        join = {};
        join[k] = true;
      }
      joinInfos = {
        1: [],
        N: [],
        NM: []
      };
      Object.keys(join).forEach((function(k) {
        var joinInfo, qs, reltype, val;
        joinInfo = {
          name: k,
          req: true,
          options: {}
        };
        val = join[k];
        reltype = this._resolveTableColumn(k, joinInfo, val);
        if (typeof val === "object") {
          if (val.as) {
            joinInfo.name = val.as;
          }
          if (val.outer) {
            joinInfo.req = false;
          }
          if (val.outer === "array") {
            joinInfo.emptyArray = true;
          }
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
          qs = val;
          if (val.where) {
            Object.keys(val.where).forEach(function(k) {
              qs[k] = val.whare[k];
            });
            delete qs.where;
          }
          joinInfo.query = qs;
        }
        joinInfos[reltype].push(joinInfo);
      }), this);
      return joinInfos;
    };
    Table.prototype._resolveTableColumn = function(k, joinInfo, val) {
      var col, len, refCols, referred, reltype, spldot, subval, tbl;
      spldot = k.split(".");
      len = spldot.length;
      reltype = void 0;
      (len <= 2) || err("invalid expression", quo(k));
      if (len === 1) {
        if (this._rels[k]) {
          joinInfo.col = k + "_id";
          joinInfo.tbl = this._rels[k];
          reltype = "1";
        } else {
          tbl = k;
          referred = this._referreds[tbl];
          if (!referred) {
            (typeof val === "object" && (val.via != null)) || err("table", quo(tbl), "is not referring table", quo(this.name));
            reltype = this._resolveTableColumn(val.via, joinInfo);
            delete val.via;
            subval = {};
            Object.keys(val).forEach(function(option) {
              if (option === "as") {
                return;
              }
              subval[option] = val[option];
              if (option !== "outer") {
                delete val[option];
              }
            });
            val.join = {};
            val.join[k] = subval;
            val.select = k;
          } else {
            refCols = Object.keys(referred);
            (refCols.length === 1) || err("table", quo(tbl), "refers", quo(this.name), "multiply");
            joinInfo.tbl = tbl;
            joinInfo.col = refCols[0] + "_id";
            reltype = "N";
          }
        }
      } else {
        tbl = spldot[0];
        col = spldot[1];
        referred = this._referreds[tbl];
        refCols = Object.keys(referred);
        refCols || err("table", quo(tbl), "is not referring table", quo(this.name));
        (refCols.indexOf(col) >= 0) || err("table", quo(tbl), "does not have a column", quo(col));
        joinInfo.tbl = tbl;
        joinInfo.col = col + "_id";
        reltype = "N";
      }
      return reltype;
    };
    Table.prototype._normalizeIndexes = function(arr) {
      return arr.map((function(def) {
        def = arrayize(def);
        return def.map((function(col) {
          if (this._rels[col]) {
            col = col + "_id";
          }
          (this._colInfos[col] !== undefined) || err(quo(col), "is unregistered column. in", quo(this.name));
          return col;
        }), this);
      }), this);
    };
    Table.prototype.__parseColumn = function(colName, columnOption) {
      var colObj;
      colObj = {
        name: colName,
        type: Table._STR,
        sqltype: Table._STR,
        required: false,
        _default: null,
        rel: false
      };
      switch (columnOption) {
        case true:
          colObj.required = true;
          break;
        case "str":
        case "text":
        case false:
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
        case 1:
          colObj.type = Table._NUM;
          colObj.sqltype = Table._INT;
          colObj.required = true;
          break;
        case "int":
        case 0:
          colObj.type = Table._NUM;
          colObj.sqltype = Table._INT;
          break;
        case "num":
        case "float":
          colObj.type = colObj.sqltype = Table._NUM;
          break;
        case 1.1:
          colObj.type = colObj.sqltype = Table._NUM;
          break;
        case 0.1:
          colObj.type = colObj.sqltype = Table._NUM;
          colObj.required = true;
          break;
        case "on":
          colObj.type = colObj.sqltype = Table._BOOL;
          colObj._default = true;
          break;
        case "bool":
        case "off":
          colObj.type = colObj.sqltype = Table._BOOL;
          colObj._default = false;
          break;
        default:
          if (typeof columnOption === "string") {
            columnOption = {
              type: columnOption
            };
          }
          (columnOption && columnOption.type) || err("invalid column description.");
          switch (columnOption.type) {
            case "text":
            case "string":
            case "str":
              colObj.type = colObj.sqltype = Table._STR;
              break;
            case "double":
            case "float":
            case "number":
            case "num":
              colObj.type = colObj.sqltype = Table._NUM;
              break;
            case "boolean":
            case "bool":
              colObj.type = colObj.sqltype = Table._BOOL;
              break;
            case "int":
              colObj.type = Table._NUM;
              colObj.sqltype = Table._INT;
              break;
            case "chars":
              colObj.type = Table._STR;
              colObj.sqltype = Table._CHRS;
              break;
            default:
              colObj.name += "_id";
              colObj.type = Table._NUM;
              colObj.sqltype = Table._INT;
              colObj.rel = columnOption.type;
              if (columnOption.required === undefined) {
                columnOption.required = true;
              }
          }
          if (columnOption._default != null) {
            (typeof columnOption._default === Table.TYPES[colObj.type]) || err("type of the default value", columnOption._default, "does not match", Table.TYPES[colObj.type], "in", colObj.name);
            colObj._default = columnOption._default;
            if (colObj.sqltype === Table._STR) {
              colObj.sqltype = Table._CHRS;
            }
          }
          if (columnOption.required) {
            colObj.required = !!columnOption.required;
          }
      }
      return colObj;
    };
    Table.prototype._orderBy = function(keys, order, report) {
      var orders;
      if (!order) {
        return keys;
      }
      orders = objectize(order, "asc");
      Object.keys(orders).reverse().forEach((function(k) {
        var idx, orderType;
        orderType = orders[k];
        if (this._indexes[k] && keys.length * 4 > this._indexes.id.length) {
          if (report) {
            report.orders.push({
              column: k,
              type: orderType,
              method: "index"
            });
          }
          idx = this._indexes[k];
          keys = conjunction(idx, keys);
          if (orderType === "desc") {
            keys = keys.reverse();
          }
        } else {
          keys = keys.slice().sort(generateCompare(this._colInfos[k].type, k, this._data));
          if (report) {
            report.orders.push({
              column: k,
              type: orderType,
              method: "sort"
            });
          }
          if (orderType === "desc") {
            keys = keys.reverse();
          }
        }
      }), this);
      return keys;
    };
    Table.prototype._select = function(keys, cols, joins, joinCols) {
      var inputCols, ret, _joinCols;
      if (typeof cols === "string") {
        if (cols === "id") {
          if (keys.length === 0 || typeof keys[0] === "number") {
            return (keys.toArray ? keys.toArray() : keys);
          }
          return keys.map(function(v) {
            return Number(v);
          });
        }
        if (joinCols && joinCols.indexOf(cols) >= 0) {
          return keys.map(function(id) {
            return joins[id][cols];
          }, this);
        }
        this._colInfos[cols] || err("column", quo(cols), "is not found in table", quo(this.name));
        return keys.map(function(id) {
          return this._data[id][cols];
        }, this);
      }
      if (cols == null) {
        ret = keys.map(function(id) {
          return copy(this._data[id]);
        }, this);
        if (joins && joinCols && joinCols.length) {
          ret.forEach(function(obj) {
            joinCols.forEach(function(col) {
              obj[col] = (!(joins[obj.id] != null) ? null : joins[obj.id][col]);
            });
          });
        }
        return ret;
      }
      if (!Array.isArray(cols)) {
        err("typeof options.select", cols, "must be string, null, or array");
      }
      inputCols = cols;
      _joinCols = [];
      cols = [];
      inputCols.forEach((function(col) {
        if (joins && joinCols && joinCols.indexOf(col) >= 0) {
          _joinCols.push(col);
        } else if (this._colInfos[col]) {
          cols.push(col);
        } else {
          err("column", quo(col), "is not found in table", quo(this.name));
        }
      }), this);
      ret = keys.map(function(id) {
        var ob;
        ob = {};
        cols.forEach((function(col) {
          ob[col] = this._data[id][col];
        }), this);
        return ob;
      }, this);
      if (joins && _joinCols.length) {
        ret.forEach(function(obj) {
          _joinCols.forEach(function(col) {
            obj[col] = joins[obj.id][col];
          });
        });
      }
      return ret;
    };
    Table.prototype._survive = function(id, query, normalized) {
      var that;
      if (!query) {
        return id;
      }
      that = this;
      query = (normalized ? query : Table._normalizeQuery(query));
      if (query.some(function(condsList) {
        return Object.keys(condsList).every(function(column) {
          return condsList[column].some(function(cond) {
            return Object.keys(cond).every(function(condType) {
              return Queries.noIndex[condType].call(that, column, cond[condType], [id]).length;
            });
          });
        });
      })) {
        return id;
      } else {
        return null;
      }
    };
    Table._normalizeQuery = function(query) {
      if (!query || !Object.keys(query).length) {
        return null;
      }
      return arrayize(query).map(function(condsList) {
        return Object.keys(condsList).reduce((function(ret, column) {
          ret[column] = arrayize(condsList[column]).map(function(cond) {
            if (cond === null) {
              return {
                equal: null
              };
            } else {
              if (typeof cond === "object") {
                return cond;
              } else {
                return {
                  equal: cond
                };
              }
            }
          });
          return ret;
        }), {});
      });
    };
    Table._reportSubQuery = function(report, info, reltype) {
      var subreport;
      subreport = {
        reltype: reltype,
        table: info.tbl,
        join_column: info.col,
        name: info.name,
        outer: !info.req,
        emptyArray: !!info.emptyArray
      };
      info.options.explain = subreport;
      report.subqueries.push(subreport);
    };
    Table._offsetLimit = function(keys, offset, limit) {
      var end;
      if ((offset == null) && (limit == null)) {
        return keys;
      }
      offset = offset || 0;
      end = (limit ? limit + offset : keys.length);
      return keys.slice(offset, end);
    };
    Table._buildReportObj = function(obj) {
      if (!obj) {
        return null;
      }
      if (!obj.searches) {
        obj.searches = [];
      }
      if (!obj.subqueries) {
        obj.subqueries = [];
      }
      if (!obj.orders) {
        obj.orders = [];
      }
      return obj;
    };
    Object.keys(Table.prototype).forEach(function(name) {
      var method;
      if (name.charAt(0) === "_") {
        return;
      }
      method = Table.prototype[name];
      if (typeof method !== "function") {
        return;
      }
      JSRel.prototype[name] = function() {
        var args, tbl, tblName;
        args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
        tblName = args.shift();
        tbl = this.table(tblName);
        tbl || err("invalid table name", quo(tblName));
        return tbl[name].apply(tbl, args);
      };
    });
    Queries = {
      index: {},
      classes: {},
      noIndex: {}
    };
    Queries.index.equal = function(col, value, list) {
      return this._idxSearchByValue(list, col, value, function(obj, data) {
        var keys;
        keys = list.keys(obj.id);
        if (keys) {
          return keys.map(function(k) {
            return list[k];
          });
        } else {
          return [];
        }
      });
    };
    Queries.index.like$ = function(col, value, list) {
      return this._idxSearchByValue(list, col, value, (function(obj, data) {
        var cur, i, included, key, len, pos, results, v;
        pos = list.bsearch(obj.id);
        key = list.key(obj.id, pos);
        results = [];
        i = ((key != null) ? key : pos + 1);
        len = list.length;
        cur = void 0;
        v = void 0;
        included = false;
        while (true) {
          cur = data[list[i]];
          v = cur[col];
          if (v.indexOf(value) === 0) {
            included = true;
            results.push(cur.id);
          } else {
            included = false;
          }
          if (!(++i < len && (v <= value || included))) {
            break;
          }
        }
        return results;
      }), this);
    };
    Queries.index.gt = function(col, value, list) {
      if (!list.length) {
        return [];
      }
      return this._idxSearchByValue(list, col, value, function(obj, data) {
        var cur, i, len, v;
        i = list.bsearch(obj.id) + 1;
        len = list.length;
        cur = void 0;
        v = void 0;
        while (true) {
          cur = data[list[i]];
          v = cur[col];
          if (!(++i < len && v <= value)) {
            break;
          }
        }
        return list.slice(i);
      });
    };
    Queries.index.ge = function(col, value, list) {
      if (!list.length) {
        return [];
      }
      return this._idxSearchByValue(list, col, value, function(obj, data) {
        var key, pos;
        pos = list.bsearch(obj.id);
        key = list.key(obj.id, pos);
        return list.slice(((key != null) ? key : pos + 1));
      });
    };
    Queries.index.lt = function(col, value, list) {
      if (!list.length) {
        return [];
      }
      return this._idxSearchByValue(list, col, value, function(obj, data) {
        var key, pos;
        pos = list.bsearch(obj.id);
        key = list.key(obj.id, pos);
        return list.slice(0, ((key != null) ? key : pos + 1));
      });
    };
    Queries.index.le = function(col, value, list) {
      if (!list.length) {
        return [];
      }
      return this._idxSearchByValue(list, col, value, function(obj, data) {
        var cur, i, len, v;
        i = list.bsearch(obj.id) + 1;
        len = list.length;
        cur = void 0;
        v = void 0;
        while (true) {
          cur = data[list[i]];
          v = cur[col];
          if (!(++i < len && v <= value)) {
            break;
          }
        }
        return list.slice(0, i);
      });
    };
    Queries.index.$in = function(col, values, list) {
      var results;
      if (!list.length) {
        return [];
      }
      results = [];
      arrayize(values).forEach((function(value) {
        this._idxSearchByValue(list, col, value, function(obj, data) {
          var k;
          k = list.key(obj.id);
          if (k != null) {
            results.push(list[k]);
          }
        });
      }), this);
      return results;
    };
    Queries.noIndex.equal = function(col, value, ids) {
      return ids.filter((function(id) {
        return this._data[id][col] === value;
      }), this);
    };
    Queries.noIndex.like$ = function(col, value, ids) {
      (this._colInfos[col].type === Table._STR) || err("Cannot use like$ search to a non-string column", col);
      return ids.filter((function(id) {
        return this._data[id][col].indexOf(value) === 0;
      }), this);
    };
    Queries.noIndex.like = function(col, value, ids) {
      return ids.filter((function(id) {
        return this._data[id][col].indexOf(value) >= 0;
      }), this);
    };
    Queries.noIndex.gt = function(col, value, ids) {
      return ids.filter((function(id) {
        return this._data[id][col] > value;
      }), this);
    };
    Queries.noIndex.ge = function(col, value, ids) {
      return ids.filter((function(id) {
        return this._data[id][col] >= value;
      }), this);
    };
    Queries.noIndex.lt = function(col, value, ids) {
      return ids.filter((function(id) {
        return this._data[id][col] < value;
      }), this);
    };
    Queries.noIndex.le = function(col, value, ids) {
      return ids.filter((function(id) {
        return this._data[id][col] <= value;
      }), this);
    };
    Queries.noIndex.$in = function(col, values, ids) {
      return ids.filter((function(id) {
        return arrayize(values).indexOf(this._data[id][col]) >= 0;
      }), this);
    };
    Queries.classes.equal = function(col, val, cls) {
      if (cls[val]) {
        return Object.keys(cls[val]);
      } else {
        return [];
      }
    };
    Queries.classes.gt = function(col, val, cls) {
      var ret;
      ret = [];
      Object.keys(cls).forEach(function(v) {
        if (v > val) {
          ret = ret.concat(Object.keys(cls[v]));
        }
      });
      return ret;
    };
    Queries.classes.ge = function(col, val, cls) {
      var ret;
      ret = [];
      Object.keys(cls).forEach(function(v) {
        if (v >= val) {
          ret = ret.concat(Object.keys(cls[v]));
        }
      });
      return ret;
    };
    Queries.classes.lt = function(col, val, cls) {
      var ret;
      ret = [];
      Object.keys(cls).forEach(function(v) {
        if (v < val) {
          ret = ret.concat(Object.keys(cls[v]));
        }
      });
      return ret;
    };
    Queries.classes.le = function(col, val, cls) {
      var ret;
      ret = [];
      Object.keys(cls).forEach(function(v) {
        if (v <= val) {
          ret = ret.concat(Object.keys(cls[v]));
        }
      });
      return ret;
    };
    Queries.classes.$in = function(col, vals, cls) {
      if (!Array.isArray(vals)) {
        return Queries.classes.equal.call(this, col, vals, cls);
      }
      return cup(vals.map(function(v) {
        return Queries.classes.equal.call(this, col, v, cls);
      }, this));
    };
    noop = function() {};
    err = function() {
      var args;
      args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
      if (args.length === 0) {
        args.push("(undocumented error)");
      }
      args.unshift("[JSRel]");
      throw new Error(args.join(" "));
    };

    /*
    shallowly copies the given object
     */
    copy = function(obj) {
      var attr, ret;
      ret = {};
      for (attr in obj) {
        if (obj.hasOwnProperty(attr)) {
          ret[attr] = obj[attr];
        }
      }
      return ret;
    };

    /*
    deeply copies the given value
     */
    deepCopy = function(val) {
      var attr, ret;
      if (Array.isArray(val)) {
        return val.map(deepCopy);
      }
      if (typeof val !== "object" || val === null || val === undefined) {
        return val;
      }
      ret = {};
      for (attr in val) {
        if (val.hasOwnProperty(attr)) {
          ret[attr] = deepCopy(val[attr]);
        }
      }
      return ret;
    };
    unique = function(arr) {
      var o;
      o = {};
      return arr.filter(function(i) {
        if (i in o) {
          return false;
        } else {
          return o[i] = true;
        }
      });
    };

    /*
    logical sum
    @params arr: <Array<Array>>
     */
    cup = function(arr) {
      return unique(Array.prototype.concat.apply([], arr));
    };
    quo = function(v) {
      return "\"" + v.toString().split("\"").join("\\\"") + "\"";
    };
    bq = function(v) {
      return "`" + v + "`";
    };
    arrayize = function(v, empty) {
      if (Array.isArray(v)) {
        return v;
      } else if (empty && (v == null)) {
        return [];
      } else {
        return [v];
      }
    };
    objectize = function(k, v) {
      var obj;
      if (typeof k !== "string") {
        return k;
      }
      obj = {};
      obj[k] = v;
      return obj;
    };
    conjunction = function(arr1, arr2) {
      var hash, i, j, l, ret, v;
      hash = {};
      i = 0;
      l = arr2.length;
      while (i < l) {
        hash[arr2[i]] = true;
        i++;
      }
      ret = [];
      j = 0;
      l = arr1.length;
      while (j < l) {
        v = arr1[j];
        if (hash[v] != null) {
          ret.push(v);
        }
        j++;
      }
      return ret;
    };

    /*
    generates comparison function
    
    @types   : data type of the column(s)
    @columns : column name(s)
    @data    : data of the column(s)
     */
    generateCompare = function(types, columns, data) {
      var col, fn;
      types = arrayize(types);
      columns = arrayize(columns);
      if (columns.length === 1) {
        if (columns[0] === "id") {
          return generateCompare[Table._NUM];
        }
        fn = generateCompare[types[0]];
        col = columns[0];
        return function(id1, id2) {
          return fn(data[id1][col], data[id2][col]);
        };
      }
      return function(id1, id2) {
        var a, b, k, result, type, _i, _len;
        a = data[id1];
        b = data[id2];
        for (k = _i = 0, _len = types.length; _i < _len; k = ++_i) {
          type = types[k];
          col = columns[k];
          result = generateCompare[type](a[col], b[col]);
          if (result) {
            return result;
          }
        }
        return 0;
      };
    };
    generateCompare[Table._BOOL] = function(a, b) {
      if (a === b) {
        return 0;
      } else if (a) {
        return 1;
      } else {
        return -1;
      }
    };
    generateCompare[Table._NUM] = SortedList.compares["number"];
    generateCompare[Table._STR] = SortedList.compares["string"];
    return JSRel;
  });

}).call(this);
