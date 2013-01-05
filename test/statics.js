var JSRel = require('../jsrel');
var vows = require('vows');
var assert = require('assert');
var schema = {
  user: {name : true},
  book: {title: true, price: 1},
  user_book: {u: "user", b: "book"},
  foo : { bar: 1 }
};

var db = JSRel.use("tmp/sample", { schema: schema });

vows.describe('== TESTING STATIC VALUES ==').addBatch({
  "JSRel": {
    topic: JSRel,

    "is running on Node.js" : function(topic) {
      assert.isTrue(JSRel.isNode);
    },

    "is not running on Browser" : function(topic) {
      assert.isFalse(JSRel.isBrowser);
    },

    "has uniqIds (Array)" : function(topic) {
      assert.isArray(JSRel.uniqIds);
    },

    "has storages including 'file'" : function(topic) {
      assert.include(JSRel.storages, 'file');
    }
  },

  "jsrel": {
    topic: db,

    "has id" : function(db) {
      assert.equal(db.id, 'tmp/sample');
    },

    "has default name" : function(db) {
      assert.equal(db.name, 'tmp/sample');
    },

    "has tables" : function(db) {
      assert.isArray(db.tables);
    },

    "the number of tables" : function(db) {
      assert.equal(db.tables.length, Object.keys(schema).length);
    },

  },

  "jsrel.name": {
    topic: JSRel.use("xxx", { schema: schema, name: "NAME" }),

    "can be set" : function(db) {
      assert.equal(db.name, 'NAME');
    }
  },

  "table": {
    topic: db.table('user'),
    "has name" : function(tbl) {
      assert.equal(tbl.name, "user");
    },

    "has columns" : function(tbl) {
      assert.isArray(tbl.columns);
    },
  }

}).export(module);
