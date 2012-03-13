var JSRel = require('../jsrel');
var vows = require('vows');
var assert = require('assert');

vows.describe('== TESTING SCHEMA ==').addBatch({
  "JSRel.use() with no schema": {
    topic: function() {
      try { return JSRel.use("tmp/schema01", {user: { name: true } }) }
      catch (e) { return e.message }
    },
    " is not allowed" : function(topic) {
      assert.match(topic, /options\.schema is required/);
    }
  },


  "A schema that has 'id' as a column name": {
    topic: function() {
      try { return JSRel.use("tmp/schema02", { schema: {user: { id: 1, name: true } }}) }
      catch (e) { return e.message }
    },
    " is not allowed" : function(topic) {
      assert.match(topic, /id is not allowed/);
    }
  },

  "A schema that has 'upd_at' as a column name": {
    topic: function() {
      try { return JSRel.use("tmp/schema03", { schema: {user: { upd_at: 1, name: true } }}) }
      catch (e) { return e.message }
    },
    " is not allowed" : function(topic) {
      assert.match(topic, /upd_at is not allowed/);
    }
  },

  "A schema that has 'bool' as a column name": {
    topic: function() {
      try { return JSRel.use("tmp/schema04", { schema: {user: { bool: false, name: true } }}) }
      catch (e) { return e.message }
    },
    " is not allowed" : function(topic) {
      assert.match(topic, /bool is not allowed/);
    }
  },

  "A schema that has 'join' as a column name": {
    topic: function() {
      try { return JSRel.use("tmp/schema100", { schema: {user: { join: false, name: true } }}) }
      catch (e) { return e.message }
    },
    " is not allowed" : function(topic) {
      assert.match(topic, /join is not allowed/);
    }
  },

  "A schema that contains ',' in a column name": {
    topic: function() {
      try { return JSRel.use("tmp/schema101", { schema: {user: { "A,B": false, name: true } }}) }
      catch (e) { return e.message }
    },
    " is not allowed" : function(topic) {
      assert.match(topic, /cannot be included in a column name/);
    }
  },

  "A schema that contains '.' in a column name": {
    topic: function() {
      try { return JSRel.use("tmp/schema102", { schema: {user: { "A.B": false, name: true } }}) }
      catch (e) { return e.message }
    },
    " is not allowed" : function(topic) {
      assert.match(topic, /cannot be included in a column name/);
    }
  },

  "A schema with no tables": {
    topic: function() {
      try { return JSRel.use("tmp/schema05", { schema: {}}) }
      catch (e) { return e.message }
    },
    " is not allowed" : function(topic) {
      assert.match(topic, /schema must contain at least one table/);
    }
  },

  "A table with no columns": {
    topic: function() {
      try { return JSRel.use("tmp/schema06", { schema: {user: {}}}) }
      catch (e) { return e.message }
    },
    " is not allowed" : function(topic) {
      assert.match(topic, /table "user" must contain at least one column/);
    }
  },

  "A schema that has unregistered indexes": {
    topic: function() {
      try { return JSRel.use("tmp/schema07", { schema: {
        user: {
          name    : true,
          $indexes: "xxxx" 
        }
      }})}
      catch (e) { return e.message }
    },
    " is not allowed" : function(topic) {
      assert.match(topic, /"xxxx" is unregistered column. in "user"/);
    }
  },

  "A schema that has unregistered classes": {
    topic: function() {
      try { return JSRel.use("tmp/schema08", { schema: {
        user: {
          name    : true,
          $classes: "xxxx" 
        }
      }})}
      catch (e) { return e.message }
    },
    " is not allowed" : function(topic) {
      assert.match(topic, /"xxxx" is unregistered column. in "user"/);
    }
  },

  "A schema that has invalid index": {
    topic: function() {
      try { return JSRel.use("tmp/schema09", { schema: {
        user: {
          name     : true,
          $indexes : {name: true}
        }
      }})}
      catch (e) { return e.message }
    },
    " is not allowed" : function(topic) {
      assert.match(topic, /is unregistered column. in "user"/);
    }
  },

  "setting classes to string columns": {
    topic: function() {
      try { return JSRel.use("tmp/schema10", { schema: {
        user: {
          name     : true,
          $classes : "name"
        }
      }})}
      catch (e) { return e.message }
    },
    " is not allowed" : function(topic) {
      assert.match(topic, /Cannot set class index to string columns "name"/);
    }
  },

  "setting xxx and xxx_id": {
    topic: function() {
      try { return JSRel.use("tmp/schema11", { schema: {
        user: { a : "a", a_id : 1 },
        rel : { a : true }
      }})}
      catch (e) { return e.message }
    },
    " is not allowed" : function(topic) {
      assert.match(topic, /"a_id" is already registered/);
    }
  },

  "A schema": {
    topic: function() {
      return JSRel.use("tmp/tiny", { schema: {
        user : {
          name: true,
          mail: true,
          age : 0,
          is_activated: "on",
          $indexes: "name",
          $uniques: [["name", "mail"]],
          $classes: "is_activated"
        },
        book : {
          title: true,
          ISBN : true,
          code : 1,
          $indexes: "title",
          $uniques: ["ISBN", "code"]
        },
        user_book: {
          u : "user",
          b : "book"
        }
      }})
    },

    " generates _tblInfos" : function(jsrel) {
      assert.ok(jsrel._tblInfos);
    },

    " generates two tables" : function(jsrel) {
      assert.equal(jsrel.tables.length, 3);
    },

    " has table 'user'" : function(jsrel) {
      assert.instanceOf(jsrel.table('user'), JSRel.Table);
    },

    " has table 'user_book'" : function(jsrel) {
      assert.instanceOf(jsrel.table('user_book'), JSRel.Table);
    },

    " And book has six columns" : function(jsrel) {
      assert.equal(jsrel.table('book').columns.length, 6);
    },

    "typeof column 'ISBN' is string" : function(jsrel) {
      assert.equal(jsrel.table('book')._colInfos.ISBN.type, JSRel.Table._STR);
    },

    "column 'ISBN' is required" : function(jsrel) {
      assert.equal(jsrel.table('book')._colInfos.ISBN.required, true);
    },

    "typeof column 'age' is number" : function(jsrel) {
      assert.equal(jsrel.table('user')._colInfos.age.type, JSRel.Table._NUM);
    },

    "column 'age' is not required" : function(jsrel) {
      assert.equal(jsrel.table('user')._colInfos.age.required, false);
    },

    "typeof 'is_activated' is boolean" : function(jsrel) {
      assert.equal(jsrel.table('user')._colInfos.is_activated.type, JSRel.Table._BOOL);
    },

    "typeof 'ins_at' is number" : function(jsrel) {
      assert.equal(jsrel.table('user')._colInfos.ins_at.type, JSRel.Table._NUM);
    },

    "typeof 'id' is number" : function(jsrel) {
      assert.equal(jsrel.table('user_book')._colInfos.id.type, JSRel.Table._NUM);
    },

    "'id' is a unique column" : function(jsrel) {
      assert.isTrue(jsrel.table('user_book')._indexes.id._unique);
    },

    "'ISBN' is a unique column" : function(jsrel) {
      assert.isTrue(jsrel.table('book')._indexes.ISBN._unique);
    },

    "'name' is not a unique index" : function(jsrel) {
      assert.isFalse(jsrel.table('user')._indexes.name._unique);
    },

    "'is_activated' is a class index" : function(jsrel) {
      assert.equal(jsrel.table('user')._classes.is_activated.cols[0], "is_activated");
    },

    "'u' is referring external table 'user'" : function(jsrel) {
      assert.equal(jsrel.table('user_book')._rels.u, 'user');
    },

    "'b_id' is not a unique index" : function(jsrel) {
      assert.isFalse(jsrel.table('user_book')._indexes.b_id._unique);
    },

    "'book' is referred by 'user_book.b'" : function(jsrel) {
      assert.isTrue(jsrel.table('book')._referreds.user_book.hasOwnProperty("b"));
    },

    "'book' is referred by 'user_book.b, and required'" : function(jsrel) {
      assert.isTrue(jsrel.table('book')._referreds.user_book.b);
    },

    "data is empty" : function(jsrel) {
      assert.lengthOf(Object.keys(jsrel.table('book')._data), 0);
    },

    "'name,mail' is a unique complex index" : function(jsrel) {
      assert.isTrue(jsrel.table('user')._indexes["name,mail"]._unique);
    },

    "'name' has two indexes" : function(jsrel) {
      assert.lengthOf(Object.keys(jsrel.table('user')._idxKeys.name), 2);
    }
  }


}).export(module);
