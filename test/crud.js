var JSRel = require('../jsrel');
var vows = require('vows');
var assert = require('assert');
var fs = require("fs");

var artists = require(__dirname + '/data/artists');

var db = JSRel.use(__dirname + "/tmp/crud", {
  storage: 'file',
  schema: {
    user : {
      name: true,
      mail: true,
      age : 0,
      is_activated: "on",
      $indexes: "name",
      $uniques: [["name", "mail"]]
    },
    book : {
      title: true,
      ISBN : true,
      ASIN: true,
      price: 1,
      $indexes: "title",
      $uniques: ["ISBN", "ASIN"]
    },
    user_book: {
      u : "user",
      b : "book"
    },
    tag : {
      word: true,
      allow_null_column: false,
      type: 1,
      is_activated: "on",
      $uniques: "word",
      $classes: ["is_activated", "type"]
    },
    book_tag : {
      b : "book",
      t : "tag"
    },
    artist: {
      name: true
    },
    song  : {
      title: true,
      rate : 1,
      artist: "artist",
      $indexes: "title"
    },

    song_tag: {
      song: "song",
      tag : "tag"
    }
  }
});

var tagTbl = db.table("tag");
fs.readFileSync(__dirname + '/data/genes', 'utf8').trim().split("\n").forEach(function(wd, k) {
  tagTbl.ins({word: wd, type: (k%5) +1});
});

var artistTbl  = db.table("artist");
var songTbl    = db.table("song");
var songTagTbl = db.table("song_tag");
Object.keys(artists).forEach(function(name) {
  var artist = artistTbl.ins({name: name});
  artists[name].forEach(function(song) {
    var song = songTbl.ins({ title: song[1], rate: song[0], artist: artist });
    songTagTbl.ins({song: song, tag_id : song.id * 2 });
    songTagTbl.ins({song: song, tag_id : song.id * 3 });
    songTagTbl.ins({song: song, tag_id : song.id * 5 });
  });
});

artistTbl.ins({name: "shinout"}); // who has no songs. (actually, I have some in MySpace!!)


vows.describe('== TESTING CRUD ==').addBatch({

  "db": {
    topic: db,

    // "Storage type is mock" : function(jsrel) {
    //   assert.equal(jsrel._storage, "mock");
    // }
  },

  "trying to use undefined table": {
    topic : function() {
      try { return db.ins('xxx_table', {name: "shinout"}) }
      catch (e) { return e.message }
    },

    "is invalid" : function(result) {
      assert.match(result, /invalid table name "xxx_table"/);
    }
  },

  "search" : {
    topic : db.table('tag'),
    "undefined condition" : function(tagTbl) {
      try {
        tagTbl.find({word: {xxx: true}});
        assert.fail();
      }
      catch (e) {
        assert.match(e.message, /undefined condition/);
      }
    },

    "undefined column" : function(tagTbl) {
      try {
        var res = tagTbl.find({xxx: 1});
        assert.fail();
      }
      catch (e) {
        assert.match(e.message, /unknown column/);
      }
    },

    "the number of entries" : function(tagTbl) {
      assert.equal(tagTbl.count(), tagTbl._indexes.id.length);
    },

    "get TLR4" : function(tagTbl) {
      var TLR4 = tagTbl.one({word: "TLR4"});
      assert.equal(TLR4.word, "TLR4");
    },

    "get AQP%" : function(tagTbl) {
      var AQPs = tagTbl.find({word: {like$: "AQP"}});
      assert.lengthOf(AQPs, 4);
    },

    "get AURKA%" : function(tagTbl) {
      var AURKAs = tagTbl.find({word: {like$: "AURKA"}});
      assert.lengthOf(AURKAs, 2);
    },

    "get %BP%" : function(tagTbl) {
      var BPs = tagTbl.find({word: {like: "BP"}});
      assert.lengthOf(BPs, 15);
    },
    "isNull": function(tagTbl) {
      var nullCols = tagTbl.find({allow_null_column: null});
      assert.lengthOf(nullCols, 1032);
    }
  },

  "search by": {
    topic : function() {
      return db.table('tag');
    },

    "select id from classes" : function(tbl) {
      var report = {};
      var results = tbl.find({type: 4}, {explain: report, select: "id", limit: 10, order : {id: "desc"}});
      assert.equal(report.searches[0].searchType, "classes");
      results.forEach(function(v, k) {
        if (results[k+1] == null) return;
        assert.isTrue(v > results[k+1]);
      });
      assert.equal(report.searches[0].searchType, "classes");
      assert.typeOf(results[0], "number");
    },

    "classes and index (merge)" : function(tbl) {
      var report = {};
      var results = tbl.find({is_activated: true, word: {like$: "L"}}, {explain: report});
      assert.equal(report.searches[0].searchType, "classes");
      assert.equal(report.searches[1].searchType, "index");
      assert.lengthOf(results, 12);
    },

    "index and noIndex" : function(tbl) {
      var report = {};
      var results = tbl.find({word: {like$: "L"}, is_activated: true}, {explain: report});
      assert.equal(report.searches[0].searchType, "index");
      assert.equal(report.searches[1].searchType, "noIndex");
      assert.lengthOf(results, 12);
    },

    "classes and classes (merge)" : function(tbl) {
      var report = {};
      var results = tbl.find({type: {ge: 3, le: 4}}, {explain: report});
      assert.equal(report.searches[0].searchType, "classes");
      assert.equal(report.searches[1].searchType, "classes");
      assert.lengthOf(results, Math.floor(1032*2/5));
    },

    "classes and index (union)" : function(tbl) {
      var report = {};
      var results = tbl.find([{type: 2}, {word: {like$: "ABL1"}}], {explain: report});
      assert.equal(report.searches[0].searchType, "classes");
      assert.equal(report.searches[1].searchType, "index");
      // note that type of ABL1 is not 2!
      assert.lengthOf(results, Math.floor(1032/5)+1+1);
    },
  },

  "join N:1": {
    topic : db.table('song'),

    "invalid relation column": function(tbl) {
      try {
        var song30 = tbl.one({id: 30}, {join: "xxxxxx"});
      }
      catch (e) {
        assert.match(e.message, /table "xxxxxx" is not referring table "song"/);
      }
    },

    "true" : function(tbl) {
      var song3 = tbl.one({id: 3}, {join: true});
      assert.equal(song3.artist.name, "paris match");
    },

    "column name (one)": function(tbl) {
      var song30 = tbl.one({id: 30}, {join: "artist"});
      assert.equal(song30.artist.name, "orangepekoe");
    },

    "column name (find)": function(tbl) {
      var song51_56 = tbl.find({id: {gt: 51, lt: 56}}, {join: "artist"});
      song51_56.forEach(function(song) {
        assert.equal(song.artist.name, "capsule");
      });
    },

    "with conditions": function(tbl) {
      var song30 = tbl.one({id: 30}, {join: {artist: {name: "orangepekoe"} } });
      assert.equal(song30.artist.name, "orangepekoe");
    },

    "with conditions (null)": function(tbl) {
      var report = {};
      var song30 = tbl.one({id: 30}, {join: {artist: {name: "paris match"} }, explain : report });
      assert.isNull(song30);
    }
  },

  "join 1:N": {
    topic : db.table('artist'),
    "column name (one)": function(tbl) {
      var report = {};
      var pm = tbl.one(
        { name: "paris match"},
        { join:
          { song : 
            { order : { rate: "desc" },
              offset: 10,
              limit : 10
            }
          },
          explain : report
        }
      );
      assert.equal(pm.song[9].rate, 2);
      assert.equal(pm.song[3].title, "eternity");
    },

    "as songs": function(tbl) {
      var report = {};
      var artists = tbl.find(null, {join: {song : {order: {rate: "desc"}, limit: 5, as: "songs" } }, explain: report });
      artists.forEach(function(artist) {
        assert.lengthOf(artist.songs, 5);
      })
    },

    "inner join": function(tbl) {
      var report = {};
      var artists = tbl.find(null, {join: {song : {order: {rate: "desc"}, as: "songs" } }, explain: report, select: "name" });
      assert.lengthOf(artists, 8);
    },

    "outer join": function(tbl) {
      var report = {};
      var shinout = tbl.one({name: "shinout"}, {join: {song : {order: {rate: "desc"}, as: "songs", outer: true } }, explain: report });
      assert.isNull(shinout.songs);
    },

    "outer join (array)": function(tbl) {
      var report = {};
      var shinout = tbl.one({name: "shinout"}, {join: {song : {order: {rate: "desc"}, as: "songs", outer: "array" } }, explain: report });
      assert.lengthOf(shinout.songs, 0);
    },
  },

  "join N:M": {
    topic : db.table('song'),
    "column name (one)": function(tbl) {
      var report = {};
      var song = tbl.one(
        { title: {like$: "アルメリア"}
        },
        { explain: report,
          join: { tag : { via : "song_tag", as : "tags", word: {like$: "A"} } }
        }
      );
      assert.lengthOf(song.tags, 2);
      assert.equal(song.tags[0].word, "AURKB");
    },
  },

  "trying to search to an empty table": {
    topic : db.table('book_tag'),

    "empty query, empty result" : function(tbl) {
      assert.lengthOf(tbl.find(), 0);
    },

    "one(1) -> null" : function(tbl) {
      assert.isNull(tbl.one(1));
    },

    "simple query -> empty result" : function(tbl) {
      assert.lengthOf(tbl.find({t_id : {gt: 1}}), 0);
    }
  },

  "insert with no value": {
    topic : function() {
      try { return db.ins('user') }
      catch (e) { return e.message }
    },

    "is invalid" : function(result) {
      assert.match(result, /You must pass object/);
    },
  },

  "insert with empty object": {
    topic : function() {
      try { return db.ins('user', {}) }
      catch (e) { return e.message }
    },

    "is invalid" : function(result) {
      assert.match(result, /column "name" is required/);
    }
  },

  "When integers are put to string columns,": {
    topic : function() {
      return db.ins('user', {name: 123, mail: 456});
    },

    "converted to string" : function(obj) {
      assert.strictEqual(obj.name, "123");
      assert.strictEqual(obj.mail, "456");
    },

    "default value is true when 'on' is used" : function(obj) {
      assert.isTrue(obj.is_activated);
    },

    "no default value is set to 'age'" : function(obj) {
      assert.isNull(obj.age);
    },

    "initial id === 1" : function(obj) {
      assert.strictEqual(obj.id, 1);
    },

    "timestamp exists" : function(obj) {
      assert.isNumber(obj.ins_at);
      assert.isNumber(obj.upd_at);
      assert.equal(obj.ins_at, obj.upd_at);
      assert.ok(new Date().getTime() - obj.ins_at < 1000 );
    },

  },

  "When invalid strings are put to number columns,": {
    topic : function() {
      try { return db.ins('book', {title: "t", price: "INVALID_PRICE", ISBN: "0226259935", ASIN: "B000J95OE4"}) }
      catch (e) { return e.message }
    },

    "NaN" : function(msg) {
      assert.match(msg, /"INVALID_PRICE" is not a valid number/);
    }
  },

  "When number strings are put to number columns,": {
    topic : function() {
      return db.ins('book', {title: "t", price: "1200", ISBN: "0226259935", ASIN: "B000J95OE4"})
    },

    "numberized" : function(obj) {
      assert.strictEqual(obj.price, 1200);
    },

    "initial id === 1" : function(obj) {
      assert.strictEqual(obj.id, 1);
    }
  },

  "When an invalid relation id is set,": {
    topic : function() {
      try { return db.ins('user_book', {u_id: 1, b_id: 2}) }
      catch (e) { return e.message }
    },

    "an exception thrown." : function(msg) {
      assert.match(msg, /invalid external id/);
    }
  },

  "Inserting a relation by object,": {
    topic : function() {
      return db.ins('user_book', {u: {id: 1}, b: {id: 1}});
    },

    "the returned value contains xxx_id" : function(obj) {
      assert.strictEqual(obj.u_id, 1);
      assert.strictEqual(obj.b_id, 1);
    }
  },

  "updating": {
    topic : db.table('tag'),

    "UpdateById" : function(tagTbl) {
      var gene10 = tagTbl.one(10);
      gene10.is_activated = false;
      var result = tagTbl.upd(gene10);
      assert.isFalse(result.is_activated);
      var result1 = tagTbl.one({id: 10, is_activated: true});
      assert.isNull(result1);
    },

    "invalid external id" : function(tbl) {
      var stTable = db.table("song_tag");
      var tag120 = stTable.one({tag_id: 120});
      tag120.tag_id = 10000;
      try {
        stTable.upd(tag120);
      }
      catch (e) {
        assert.match(e.message, /invalid external id/);
      }
    },

    "classes": function(tbl) {
      var report = {}
      var tag = tbl.one(82);
      assert.equal(tag.type, 2);
      tag.type = 4;
      tbl.upd(tag);
      var type2s = db.one('tag', {type: 2, id: 82}, {explain: report});
      assert.equal(report.searches[0].searchType, "classes");
      assert.isNull(type2s);

      report = {}
      var type4s = db.one('tag', {type: 4, id: 82}, {explain: report});
      assert.equal(report.searches[0].searchType, "classes");
      assert.equal(type4s.id, 82);
      assert.equal(type4s.type, 4);
    },

    "indexes": function(tbl) {
      var report = {}
      var tag = tbl.one(95);
      word = tag.word;
      tag.word = "すまん、こんな値にして...";
      tbl.upd(tag);
      var v1 = db.one('tag', {word: word}, {explain: report});
      assert.equal(report.searches[0].searchType, "index");
      assert.isNull(v1);

      report = {}
      var v2 = db.one('tag', {word: tag.word}, {explain: report});
      assert.equal(report.searches[0].searchType, "index");
      assert.equal(v2.id, 95);
      assert.equal(v2.word, tag.word);
    },

    "relations1 : new values": function(tbl) {
      var tagJoinSongs = tbl.one(30, {join : "song_tag"});
      var len = tagJoinSongs.song_tag.length;
      tagJoinSongs.song_tag.push({song_id: 19});
      tagJoinSongs.song_tag.push({song_id: 23});
      tbl.upd(tagJoinSongs);
      var tagJoinSongs2 = tbl.one(30, {join : "song_tag"});
      assert.lengthOf(tagJoinSongs2.song_tag, len + 2);
    },

    "relations2 : update values": function(tbl) {
      var tagJoinSongs = tbl.one(30, {join : "song_tag"});
      var len = tagJoinSongs.song_tag.length;
      tagJoinSongs.song_tag.pop();
      tagJoinSongs.song_tag.shift();
      tagJoinSongs.song_tag[0].song_id = 55;

      tagJoinSongs.song_tag.push({song_id: 29});
      tbl.upd(tagJoinSongs);
      var tagJoinSongs2 = tbl.one(30, {join : "song_tag"});
      assert.lengthOf(tagJoinSongs2.song_tag, len - 1);
      assert.equal(tagJoinSongs2.song_tag[0].song_id, 55);
    },

    "relations3 : append values": function(tbl) {
      var tagJoinSongs = tbl.one(33, {join : "song_tag"});
      var len = tagJoinSongs.song_tag.length;
      delete tagJoinSongs.song_tag;
      tagJoinSongs.song_tag = [{song_id : 57}, {song_id: 77}];
      tbl.upd(tagJoinSongs, { append: true });
      var tagJoinSongs2 = tbl.one(33, {join : "song_tag"});
      assert.lengthOf(tagJoinSongs2.song_tag, len + 2);
    },
  },

  "deleting": {
    topic : db,

    "also related data" : function(db) {
      var tag1000 = db.one('tag', 20, {join: "song_tag"});
      var song_tags = tag1000.song_tag;
      assert.lengthOf(song_tags, 2);
      db.del('tag', 20);

      song_tags.forEach(function(st) {
        var v = db.one("song_tag", st.id);
        assert.isNull(v);
      });
    },

    "classes" : function(db) {
      var tag = db.one('tag', 22);
      assert.equal(tag.type, 2);
      db.del('tag', 22);
      var report = {};
      var type2s = db.one('tag', {type: 2, id: 22}, {explain: report});
      assert.equal(report.searches[0].searchType, "classes");
      assert.isNull(type2s);
    },

    "index" : function(db) {
      var tag = db.one('tag', 23);
      var word = tag.word;
      db.del('tag', 23);
      var report = {};
      var result = db.one('tag', {word: word}, {explain: report});
      assert.equal(report.searches[0].searchType, "index");
      assert.isNull(result);
    }
  },

  "inserting": {
    topic : db,

    "with 1:N relations" : function() {
      var newUser = { name: "user1234", mail: "user1234@user1234.com" };
      newUser.user_book = [];
      for (var k=1; k<=10; k++) {
        var bookData = { title: "book" + k, ISBN : "ISBN" + k, ASIN: "ASIN" + k, price: k * 1000 };
        var newId = db.table("book").ins(bookData).id;
        newUser.user_book.push({ b_id : newId });
      }
      var newId = db.ins("user", newUser).id;
      var newU = db.one("user", newId, { join : { b : { via : "user_book" } } });
      assert.lengthOf(newU.b, 10);
    }
  },



}).export(module);
