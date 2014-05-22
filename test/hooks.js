var JSRel = require('../lib/jsrel.js');
var vows = require('vows');
var assert = require('assert');
var fs = require("fs");
var Table = JSRel.Table;

var artists = require(__dirname + '/data/artists');

var db = JSRel.use("hook_test", {
  storage: 'mock',
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

vows.describe('== TESTING HOOKS ==').addBatch({
  "hooks:basic functions": {
    "on" : function() {
      db.on("event name:hogehoge", function() {
      });

      assert.isArray(db._hooks["event name:hogehoge"]);
      assert.lengthOf(db._hooks["event name:hogehoge"], 1);
    },
    "off" : function() {
      var fnToOff = function() {};
      db.on("xxx", fnToOff);
      db.on("xxx", function(){});
      db.on("xxx", function(){});
      db.on("xxx", function(){});

      assert.lengthOf(db._hooks["xxx"], 4);
      db.off("xxx", fnToOff);
      assert.lengthOf(db._hooks["xxx"], 3);
    },

    "off all" : function() {
      assert.lengthOf(db._hooks["xxx"], 3);
      db.off("xxx");
      assert.isNull(db._hooks["xxx"]);
    },

    "emit": function() {
      var counter = 0;
      db.on("emit_test", function(){ counter++ });
      db.on("emit_test", function(v){ counter+=v });
      db.on("emit_test", function(){ counter+=10 });
      db.on("emit_test", function(v,a){ counter+=a*v });
      db._emit("emit_test", 3, 100);
      assert.equal(counter, 314);
    }
  },

  "hooks:actual implements in JSRel": {
    "save": function() {
      var saved = false;
      db.on("save:start", function(origin) {
        if (!saved)
          assert.equal(origin, null);
        else 
          assert.equal(origin, db.$export());
      });
      db.on("save:end", function(data) {
        assert.equal(data, db.$export());
        saved = true;
      });
      db.save();
      db.save();
    },

    "ins": function() {
      db.on("ins", function(table, insObj) {
        assert.equal(table, "artist");
        assert.isString(insObj.name);
      });
      db.on("ins:user", function(insObj) {
        assert.fail("this never be called.");
      });
      db.on("ins:artist", function(insObj) {
        assert.isString(insObj.name);
      });

      db.ins("artist", {name: "Stevie Wonder"});
      db.ins("artist", {name: "the Beatles"});
    },

    "upd": function() {
      db.on("upd", function(table, updObj, old, updKeys) {
        assert.equal(table, "song_tag");
        assert.isObject(updObj);
        assert.isObject(old);
        assert.isArray(updKeys);
      });
      db.on("upd:user", function() {
        assert.fail("this never be called.");
      });
      db.on("upd:song_tag", function(updObj, old, updKeys) {
        assert.equal(updObj.song_id, new_song_id);
        assert.equal(old.song_id, old_song_id);
        assert.lengthOf(updKeys, 1);
        assert.equal(updKeys[0], "song_id");
      });

      var st = db.one("song_tag", {}, {join: {song:{title: "やわらかな夜"}}});
      var old_song_id = st.song.id;
      var new_song_id = db.one("song", {title: "ハイビスカス"}, {select: "id"});
      st.song_id = new_song_id; 
      db.upd("song_tag", st);
    }
  }
}).export(module);
