JSRel
=========

description
------------
JavaScript synchronous RDB (Relational database) without SQL

Available in modern browsers and Node.js.

API at a glance
----------------
First, define the schema

```js
var db = JSRel.use("dbname", {schema: 
  { user: { name : true, is_activated: "on", $uniques: "name"},
    book: { title: true, price: 1, author: "user", $indexes: "title" },
}});
```

Second, insert data

```js
var u1 = db.ins('user', {name: 'shinout'});
var u2 = db.ins('user', {name: 'xxxxx', is_activated: false});
var b1 = db.ins('book', {title: 'how to jsrel', price: 10, author: u1});
var b2 = db.ins('book', {title: 'JSRel API doc', price: 20, author_id: u1.id});
```

Find them!

```js
var users = db.find('user', {is_activated: true});
```

Get one!

```js
var shinout = db.one('user', {name: "shinout"});
```

Greater Than, Less Equal!

```js
var booksGreaterThan5  = db.find('book', { price: {gt: 5} } );
var booksLessEqual15   = db.find('book', { price: {le: 15} } );
```

Like xxx%

```js
var booksLikeJS = db.find('book', { title: {like$: "JS"} } );
```

Join!

```js
var usersJoinBooks = db.find('user', {is_activated: true}, {join: "book"});
```

OrderBy! Offset! Limit!

```js
var users = db.find('user', null, {order: "name", limit : 10, offset : 3} );
```


Perpetuation

```js
db.save();
```

Export / Import

```js
var str = db.$export();
    var newDB = JSRel.$import("newID", str);
```

dump as SQL!

```js
var sql = db.toSQL();
```

suitable applications
---------------------

- rich client applications
- tiny serverside applications
- client caching
- mock DB

NOT suitable for applications which require scalability.


motivation
-------------
Thinking about the separation of the Model layer.

If we connect to DB asynchronously, we must handle lots of callbacks in a model method.

```js
model.getUserBooks = function(name, callback) {
  db.find("user", {name: name}, function(err, users) {
    db.find("book", {user_id: users[0].id}, callback);
  });
};
```

If we access to DB synchoronously, we can easily write human-readable model APIs.

```js
model.getUserBooks = function(name) {
  var user  = db.find("user", {name: "xxyy"})[0];
  return db.find("book", {user_id: user.id});
};
```

Also, synchoronous codes have an advantage of error handling.

###I hate Blocking APIs!###

Why not making it standalone using WebWorker (browsers) or child_process.fork() (Node.js)?
Then the whole calculation process doesn't affect the main event loop and we can get the result asynchronously.

I prepared another JavaScript library for this purpose.

[standalone](https://github.com/shinout/standalone).

Then, we can access model methods like

```js
model.getUserBooks("user01", function(err, result) {
})
```

by defining

```js
model.getUserBooks = function(name) {
  var user  = db.find("user", {name: "xxyy"})[0];
  if (!user) return [];
  return db.find("book", {user_id: user.id});
};
```

That is, try/catch and asynchronous APIs are automatically created via [standalone](https://github.com/shinout/standalone).

See **make it standalone** for detailed usage.


installation
-------------

```bash
    $ npm install jsrel
```

When using in modern browsers, 

```html
<script type="text/javascript" src="/path/to/SortedList.js"></script>
<script type="text/javascript" src="/path/to/jsrel.js"></script>
```

In Node.js,

```js
var JSRel = require('jsrel');
```

is the way to load the library.

In browsers, the variable "JSRel" is set to global.

In Web Worker,

```js
importScripts('/pathto/SortedList.js', '/pathto/jsrel.js');
```

See also **make it standalone**.

dependencies
-------------
JSRel internally uses **[SortedList](https://github.com/shinout/SortedList)**
When installed with npm, it is automatically packed to node_modules/sortedlist
Otherwise, you must install it via github.


JSRel API documentation
-------------------------

**JSRel**

- JSRel.use(uniqId, options)
- JSRel.$import(uniqId, data_str, options)
- JSRel.uniqIds
- JSRel.isNode
- JSRel.isBrowser


**instance of JSRel (jsrel)**

- jsrel.table(tableName)
- jsrel.save()
- jsrel.$export()
- jsrel.toSQL(options)
- jsrel.id
- jsrel.name
- jsrel.tables


**instance of JSRel Table (table)**

- table.columns
- table.ins(obj)
- table.upd(obj, options)
- table.find(query, options)
- table.one(id)
- table.one(query, options)
- table.del(id)
- table.del(query)


**shortcut**

- jsrel.ins(tableName, ...)
- jsrel.upd(tableName, ...)
- jsrel.find(tableName, ...)
- jsrel.one(tableName, ...)
- jsrel.del(tableName, ...)


### JSRel.use(uniqId, options) ###
Creates instance if not exist.
Gets previously created instance if already exists.

**uniqId** is the identifier of the instance, used for storing the data to external system (file system, localStorage and so on).
**options** is as follows.
<table>
<tr><th>key</th>
<td>type</td>
<td>required?</td>
<td>description</td>
<td>example</td></tr>

<tr><th>storage</th>
<td>string</td>
<td>no</td>
<td>type of external storages. oneof "mock", file" "local" "session"<br>
When running in Node.js, "file" is set by default.<br>
uniqId is the path name to save the data to.
When running in browsers, "local" is set by default.<br>
local means "localStorage", session means "sessionStorage".
When running in Web Worker, "mock" is set and no other options can be selected.  <br>
"mock" saves nothing. This is limitation of Web Worker which cannot access to Web Storages.
In this case, exporting the data to the main thread, we can manually handle and store the data.<br>
</td>
<td>"file"</td>
</tr>

<tr><th>schema</th>
<td>object</td>
<td>required</td>
<td>DB schema</td>
<td>(see <strong>SCHEMA JSON</strong>)</td></tr>

<tr><th>reset</th>
<td>boolean</td>
<td>no (default false)</td>
<td>if true, reset db with the given schema.</td>
<td>true</td></tr>

<tr><th>autosave</th>
<td>boolean</td>
<td>no (default false)</td>
<td>whether to auto-saving or not</td>
<td>true</td></tr>
</table>

#### SCHEMA JSON ####

```js
{
  tableName1: tableDescription,
  tableName2: { 
    columnName1 : columnDescription,
    columnName2 : columnDescription
  }
}
```

**table description**

<table>
<tr><td>key</td>
<td>type</td>
<td>description</td>
<td>example</td></tr>

<tr><th>(columnName)</th>
<td><strong>columnDescription</strong></td>
<td>column to set.<br>
<strong>name limitation</strong><br>
Cannot set [id, ins_at, upd_at] as they are already used by default.<br>
Cannot set [$indexes, $uniques, $classes] as they make conflict in schema description.<br>
Cannot set [str, num, bool, on, off] as they make conflict in column description.<br>
Cannot set [join, order, limit, offset, as, where, select, explain] as they make conflict in search options.<br>
Cannot include "," or "." as it is used in indexing or searching.<br>
Cannot set (RelatedTableName)_id as it is automatically set.<br>
</td>
<td>age: "num"</td>
</tr>

<tr><th>$indexes</th>
<td>Array<Array></td>
<td>list of indexes. child arrays are lists of columns to make an index.<br>
If string given, converted as array with the value<br>
</td>
<td>[["name"], ["firstName", "lastName"]]</td></tr>

<tr><th>$uniques</th>
<td>Array<Array></td>
<td>(the same as $indexes, but this means unique index)</td>
<td>[["name", "pass"]]</td></tr>

<tr><th>$classes</th>
<td>Array<Array></td>
<td>(the same as $indexes, but this means classified index)</td>
<td>"type_num"</td></tr>

</table>

**column description**
<table>
<tr><td>example</td>
<td>description</td>

<tr><th>{type: "str"}</th>
<td>type is string.
type must be one of ["str", "num", "bool", (columnName)]
</td></tr>

<tr><th>{type: "str", required: false}</th>
<td>type is string, and if not given, null is set.
required option is false by default
</td></tr>

<tr><th>{type: "bool", _default: true}</th>
<td>type is boolean, and if not given, true is set.</td></tr>

<tr><th>{type: "num", required: true}</th>
<td>type is number, and if not given, an exception is thrown.</td></tr>

<tr><th>"str"</th>
<td>type is string, and not required.</td></tr>

<tr><th>"num"</th>
<td>type is number, and not required.</td></tr>

<tr><th>"bool"</th>
<td>type is boolean, and not required.</td></tr>

<tr><th>true</th>
<td>type is string, and required.</td></tr>

<tr><th>false</th>
<td>type is string, and not required.</td></tr>

<tr><th>1</th>
<td>type is number, and required.</td></tr>

<tr><th>0</th>
<td>type is number, and not required.</td></tr>

<tr><th>"on"</th>
<td>type is boolean, and default value is true.</td></tr>

<tr><th>"off"</th>
<td>type is boolean, and default value is false.</td></tr>

<tr><th>{type: tableName}</th>
<td>type is the instance of a record in tableName.<br>
the column columnName_id is automatically created.<br>
We can set columnName_id instead of columnName in insertion and updating.<br>
This column is <strong>required</strong> unless you set required: false.
</td></tr>

<tr><th>{type: tableName, required: false}</th>
<td>type is the instance of a record in tableName and not required.<br>
</td></tr>

<tr><th>tableName</th>
<td>type is the instance of a record in tableName and <strong>required</strong>.<br>
</td></tr>

</table>


### JSRel.$import(uniqId, data_str, options) ###
Imports **data_str** and creates a new instance with **uniqId**.
**data_str** must be a stringified JSON generated by **jsrel.$export()**.

if **options.force** is true, overrides already-existing database,
otherwise throws an exception.

Returns instance of JSRel.

As "import" is a reserved word in JavaScript, used "$import" instead.


### JSRel.free(uniqId) ###
Free the region of database **uniqId**.


### JSRel.isNode ###
(ReadOnly boolean) if Node.js, true.


### JSRel.isBrowser ###
(ReadOnly boolean) if the executing environment has "localStorage" and "sessionStorage" in global scope, true.


instanceof JSRel (shown as jsrel)
------
### jsrel.table(tableName) ###
Returns a table object whose name is **tableName** (registered from the schema).
If absent, throws an exception.


### jsrel.save() ###
Saves current data to the storage.
Returns **jsrel**

### jsrel.$export() ###

Exports current data as the format above.
Returns data.

As "export" is a reserved word in JavaScript, used "$export" instead.

### jsrel.toSQL(options) ###
Gets SQL string from the current schema and data.

**options**

<table>
<tr><th>option name</th>
<td>type</td>
<td>description</td>
<td>default</td>
<td>example</td></tr>

<tr><th>noschema</th>
<td>boolean</td>
<td>if true, schema SQLs (create statements) are not generated.</td>
<td>null</td>
<td>true</td>
</tr>

<tr><th>nodrop</th>
<td>boolean</td>
<td>if true, drop statements are not generated.</td>
<td>null</td>
<td>true</td>
</tr>

<tr><th>nodata</th>
<td>boolean</td>
<td>if true, data SQLs (insert statements) are not generated.</td>
<td>null</td>
<td>true</td>
</tr>

<tr><th>type</th>
<td>string</td>
<td>type of RDBs. Currently, "mysql" is only tested.</td>
<td>"mysql"</td>
<td>"mysql"</td>
</tr>

<tr><th>engine</th>
<td>string</td>
<td>MySQL engine (only enabled when options.type is "mysql")</td>
<td>"InnoDB"</td>
<td>"MyISAM"</td>
</tr>

<tr><th>rails (unstable)</th>
<td>boolean</td>
<td>if true, rails-like date format (created_at, inserted_at) is output.</td>
<td>null</td>
<td>true</td>
</tr>

</table>

### jsrel.id ###
(ReadOnly) gets id


### jsrel.name ###
(ReadOnly) gets name


### jsrel.tables ###
(ReadOnly) gets list of registered tables

```js
[table1, table2, ...]
```


instanceof JSRel.Table (shown as table)
------
### table.columns ###
(ReadOnly) gets registered columns in the table

    [column1, column2, ...]

### table.ins(obj) ###
Registers a new record.
**obj** must be compatible with columns of the table.
Otherwise it throws an exception.
Returns an instance of the record.
It is NOT the same as the given argument, as the new object contains "id".

Before insertion, Type checking is performed.
JSRel tries to cast the data.


#### record object ####
Record objects have all columns registered in the table.

In addition, they have **id**, **ins_at**, **upd_at** in their key.
These are all automatically set.

**ins_at** and **upd_at** are timestamp values and cannot be inserted.

**id** is auto-incremented unique integer.

We can specify **id** in insertion.
    
```js
table.ins({id: 11, name: "iPhone"});
```

When the table already has the same id, an exception is thrown.


#### relation handling in insertion ####
OK, let's think upon the following schema.

```js
var schema = { user: {
    nickName : true,
    fitstName: false,
    lastName : false
  },
  card: {
    title : true,
    body  : true
  },
  user_card {
    user: "user",
    card: "card",
    owner: {type : "user", required: false}
    $uniques: { user_card: ["user", "card"] }
  }
}
```

First, inserts users and cards.
    
```js
var jsrel = JSRel.use('sample', {schema: schema});
    
var uTable = jsrel.table('user');
var shinout = uTable.ins({nickName: "shinout"});
var nishiko = uTable.ins({nickName: "nishiko"});
var cTable = jsrel.table('card');
var rabbit = uTable.ins({title: "rabbit", body: "It jumps!"});
var pot    = uTable.ins({title: "pot", body: "a tiny yellow magic pot"});
```


Then, inserts these relations.

```js
var ucTable = jsrel.table('user_card');
ucTable.ins({ user: shinout, card: rabbit });
```


We can also insert these relation like

```js
ucTable.ins({ user_id: nishiko.id, card_id: pot.id });
ucTable.ins({ user_id: 1, card_id: 2 }); // 1: shinout, 2: pot
```

Remember that user_id and card_id are automatically generated and it represent the id column of each instance.
When we pass an invalid id to these columns, an exception is thrown.

```js
ucTable.ins({ user_id: 1, card_id: 5 }); // 1: shinout, 5: undefined!
```

When a relation column is not required, we can pass null.

```js
ucTable.ins({ user: nishiko, card_id: 1, owner_id: null });
```

When duplicated, **xxxx_id priors to xxxx** (where xxxx is the name of the original column).

```js
ucTable.ins({ user: nishiko, user_id: 1, card_id: 1 }); // user_id => 1
```

#### inserting relations ####

```js
obj.rel_table = [relObj1, relObj2, ...];
table.ins(obj);
```
relObj1, relObj2 are also inserted to table "rel_table" containing the new id as the external key.

If the main table is related to the **rel_table** multiply,
you must specify the column like

```js
obj["rel_table.relcolumn"] = [relObj1, relObj2, ...];
table.ins(obj);
```


### table.upd(obj, options) ###
Updates an existing record.
**obj** must contains **id** key.
Only the valid keys (compatible with columns) in **obj** is updated.
Throws **no** exceptions when you passes invalid keys.
Throws an exception when you an invalid value with a valid key.

Returns an instance of the updated record.
It is NOT the same as the given argument.

#### relation updates ####

updating related tables

```js
obj.rel_table = [relObj1, relObj2, ...];
table.upd(obj, {append: append});
```

if **relObj** contains "id" column, updating the object.
Otherwise, inserting the object.
If **options.append** is false or not given, already existing related objects are deleted.

If the main table is related to the **rel_table** multiply,
you must specify the column like

```js
obj["rel_table.relcolumn"] = [relObj1, relObj2, ...];
table.upd(obj, {append: append});
```


### table.find(query, options) ###
Selects records.
Returns a list of records.
**query** is an object to describe how to fetch records.


#### query examples ####
<table>
<tr><td>example</td>
<td>description</td>

<tr><th>{name: "shinout"}</th>
<td>name must be equal to "shinout"</td></tr>

<tr><th>{name: ["shinout", "nishiko"]}</th>
<td>name must be equal to "shinout" or "nishiko"</td></tr>

<tr><th>{name: {like$: "shin"}}</th>
<td>name must be like "shin%"</td></tr>

<tr><th>{name: {$like: "inout"}}</th>
<td>name must be like "%inout"</td></tr>

<tr><th>{name: [{$like: "inout"}, {equal: "nishiko"}] }</th>
<td>name must be like "%inout" AND equals "nishiko"</td></tr>

<tr><th>{name: {$like: "inout", equal: "nishiko"} }</th>
<td>name must be like "%inout" AND equals "nishiko"</td></tr>

<tr><th>{age: {gt: 24} }</th>
<td>age must be greater than 24</td></tr>

<tr><th>{age: {gt: 24, le: 40} }</th>
<td>age must be greater than 24 and less equal 40</td></tr>

<tr><th>{age: [{ge: 24}, {lt: 40}] }</th>
<td>age must be greater equal 24 or less than 40</td></tr>

<tr><th>{country: {$in: ["Japan", "Korea"] }</th>
<td>country must be one of "Japan", "Korea" (as "in" is a reserved word in JavaScript, used "$in" instead.)</td></tr>

<tr><th>{name: "shinout", age : {ge: 70 }</th>
<td>must returns empty until shinout becomes 70</td></tr>

</table>


**options** is as follows.

<table>
<tr><th>key</th>
<td>type</td>
<td>description</td>
<td>example</td></tr>

<tr><th>order</th>
<td>mixed</td>
<td>see <strong>order description</strong></td>
<td>{ name: "asc" }</td>
</tr>

<tr><th>limit</th>
<td>int</td>
<td>the end position of the data</td>
<td>20</td></tr>

<tr><th>offset</th>
<td>int</td>
<td>offset of the results</td>
<td>10</td></tr>

<tr><th>join</th>
<td>mixed</td>
<td>see <strong>join description</strong></td>
<td>{records.scene: {title : {like$: "ABC"} }</td></tr>

<tr><th>select</th>
<td>string (one of column names)</td>
<td>get list of selected columns instead of objects</td>
<td>"title"</td></tr>

<tr><th>select</th>
<td>array (list of column names)</td>
<td>get list of object which contains the given columns instead of all columns</td>
<td>["name", "age"]</td></tr>

<tr><th>explain</th>
<td>object</td>
<td>put searching information to the given object</td>
<td>{}</td></tr>

</table>

#### order description ####
<table>
<tr><td>example</td>
<td>description</td>

<tr><th>"age"</th>
<td>order by age asc</td></tr>

<tr><th>{age: "desc"}</th>
<td>order by age desc</td></tr>

<tr><th>{age: "desc", name: "asc"}</th>
<td>order by age desc, name asc</td></tr>
</table>


#### results ####
Returns list of instances

```js
[ {id: 1, name: "shinout"}, {id: 2, name: "nishiko"}, ...]
```

#### join description ####
sample data

<p>group</p>
<table>
<tr><td>id</td><td>name</td></tr>
<tr><td>1</td><td>mindia</td></tr>
<tr><td>2</td><td>ZZZ</td></tr>
</table>

<p>user</p>
<table>
<tr><td>id</td><td>name</td><td>age</td><td>group</td></tr>
<tr><td>1</td><td>shinout</td><td>25</td><td>1</td></tr>
<tr><td>2</td><td>nishiko</td><td>28</td><td>1</td></tr>
<tr><td>3</td><td>xxx</td><td>39</td><td>2</td></tr>
</table>

<p>card</p>
<table>
<tr><td>id</td><td>title</td><td>body</td></tr>
<tr><td>1</td><td>rabbit</td><td>it jumps!</td></tr>
<tr><td>2</td><td>pot</td><td>a tiny yellow magic pot</td></tr>
<tr><td>3</td><td>PC</td><td>calculating...</td></tr>
</table>

<p>user_card</p>
<table>
<tr><td>id</td><td>user</td><td>card</td></tr>
<tr><td>1</td><td>1</td><td>1</td></tr>
<tr><td>2</td><td>2</td><td>1</td></tr>
<tr><td>3</td><td>1</td><td>2</td></tr>
<tr><td>4</td><td>2</td><td>3</td></tr>
<tr><td>5</td><td>3</td><td>3</td></tr>
</table>

**Fetching N:1 related objects**

```js
var result = db.table('user').find({name: "shinout"}, {join: JOIN_VALUE});
```

<table>
<tr>
<td>No.</td>
<td>JOIN_VALUE</td>
<td>description</td>
<td>result</td></tr>

<tr>
<td>1</td>
<th>"group"</th>
<td>get "group" column as object</td>
<td>[{id: 1, name: "shinout", age: 25, group_id: 1, group: {id: 1, name: "mindia"}}]</td>
</tr>

<tr>
<td>2</td>
<th>{group : true}</th>
<td>get "group" column as object (the same as sample1)</td>
<td>[{id: 1, name: "shinout", age: 25, group_id: 1, group: {id: 1, name: "mindia"}}]</td>
</tr>

<tr>
<td>3</td>
<th>true</th>
<td>get all the related columns as object</td>
<td>[{id: 1, name: "shinout", age: 25, group_id: 1, group: {id: 1, name: "mindia"}}]</td>
</tr>

<tr>
<td>4</td>
<th>{group : {name: {like$: "mind"}}}</th>
<td>get "group" column as object whose name starts at "mind"</td>
<td>[{id: 1, name: "shinout", age: 25, group_id: 1, group: {id: 1, name: "mindia"}}]</td>
</tr>

<tr>
<td>5</td>
<th>{group : {name: "ZZZ"}}</th>
<td>get "group" column as object whose name is equal to "ZZZ"</td>
<td>[] // empty</td>
</tr>
</table>


**Fetching 1:N related objects**

    var result = db.table('group').find({name: "mindia"}, {join: JOIN_VALUE});

<table>
<tr>
<td>No.</td>
<td>JOIN_VALUE</td>
<td>description</td>
<td>result</td></tr>

<tr>
<td>6</td>
<th>"user.group"</th>
<td>get "user" table objects (setting the related column in "user" table)</td>
<td>[{id: 1, name: "mindia", "user.group": [{id: 1, name: "shinout", age: 25}, {id: 2, name: "nishiko", age: 28}]}]</td>
</tr>

<tr>
<td>7</td>
<th>"user"</th>
<td>get "user" table objects (if related column is obvious)</td>
<td>[{id: 1, name: "mindia", "user": [{id: 1, name: "shinout", age: 25}, {id: 2, name: "nishiko", age: 28}]}]</td>
</tr>

<tr>
<td>8</td>
<th>{"user.group" : true }</th>
<td>get "user" table objects (the same as sample6)</td>
<td>[{id: 1, name: "mindia", "user.group": [{id: 1, name: "shinout", age: 25}, {id: 2, name: "nishiko", age: 28}]}]</td>
</tr>

<tr>
<td>9</td>
<th>{"user.group" : {age : {gt: 27}} }</th>
<td>get "user" table objects with age greater than 27</td>
<td>[{id: 1, name: "mindia", "user.group": [{id: 2, name: "nishiko", age: 28}]}]</td>
</tr>

<tr>
<td>10</td>
<th>{"user.group" : {age : {gt: 27}, as: "users"} }</th>
<td>get "user" table objects with age greater than 27, with alias name "users"</td>
<td>[{id: 1, name: "mindia", "users": [{id: 2, name: "nishiko", age: 28}]}]</td>
</tr>

<tr>
<td>11</td>
<th>{"user.group" : {where : {age : {gt: 27}}, as: "users"} }</th>
<td>get "user" table objects with age greater than 27, with alias name "users" (the canonical expression of sample9)</td>
<td>[{id: 1, name: "mindia", "users": [{id: 2, name: "nishiko", age: 28}]}]</td>
</tr>

<tr>
<td>12</td>
<th>{user : {age : {gt: 27}, as: "users"} }</th>
<td>get "user" table objects with age greater than 27, with alias name "users"</td>
<td>[{id: 1, name: "mindia", "users": [{id: 2, name: "nishiko", age: 28}]}]</td>
</tr>

<tr>
<td>13</td>
<th>{user : {age : {gt: 47}, outer: true} }</th>
<td>outer joining. Records containing Empty 1:N subqueries can be remained with the column filled with null.</td>
<td>[{id: 1, name: "mindia", "users": null}]</td>
</tr>

<tr>
<td>13</td>
<th>{user : {age : {gt: 47}, outer: "array"} }</th>
<td>outer joining. Records containing Empty 1:N subqueries can be remained with the column filled with empty array.</td>
<td>[{id: 1, name: "mindia", "users": [] }]</td>
</tr>


</table>

**Fetching N:M related objects**

    var result = db.table('user').find({name: "shinout"}, {join: JOIN_VALUE});

<table>
<tr>
<td>15</td>
<th>{"card": {via: "user_card"} }</th>
<td>get "card" related through "user_card"</td>
<td>[{id: 1, name: "shinout", "card": [ {id:1, ...}, {id: 3, ...}] }]</td>
</tr>
</table>

### table.one(id) ###
Gets one object by id.

### table.one(query, options) ###
Gets one result by **table.find()**.


### table.del(id) ###
Deletes a record with a given **id** .


### table.del(query) ###
Deletes records with a given **query** .
**query** is the same argument as **table.find(query)**.


#### relation handling in deletion ####
When a record is deleted, related records are also deleted.


Think upon the schema.

First, inserts users, cards and these relations.

```js
var jsrel = JSRel.use('sample', {schema: schema});

var uTable = jsrel.table('user');
var cTable = jsrel.table('card');
var ucTable = jsrel.table('user_card');

var shinout = uTable.ins({nickName: "shinout"});
var nishiko = uTable.ins({nickName: "nishiko"});

var rabbit = uTable.ins({title: "rabbit", body: "It jumps!"});
var pot    = uTable.ins({title: "pot", body: "a tiny yellow magic pot"});

ucTable.ins({ user: shinout, card: rabbit });
ucTable.ins({ user: nishiko, card: rabbit });
ucTable.ins({ user: shinout, card: pot });
```


Next, delete shinout.

```js
uTable.del(shinout);
```

Then, the dependent records ( shinout-rabbit, shinout-pot ) are also removed.

```js
ucTable.find().length; // 1 (nishiko-rabbit)
```


shortcut
--------

- jsrel.ins(tableName, ...)
- jsrel.upd(tableName, ...)
- jsrel.find(tableName, ...)
- jsrel.one(tableName, ...)
- jsrel.del(tableName, ...)

are, select table via jsrel.table(tableName) in the first place.
Then run the operation using the remaining arguments.

for example,

```js
jsre.ins('user', {nickName: "shinout"});
```

is completely equivalent to

```js
jsrel.table('user').ins({nickName: "shinout"});
```


make it standalone
--------------------
**[standalone](https://github.com/shinout/standalone)** is a library to make a worker process / thread which can communicate with master.

Here are the basic concept.

master.js

```js
standalone("worker.js", function(model) {

  model.getSongsByArtist("the Beatles", function(err, songs) {
    console.log(songs);
  });

});
```


worker.js
    
```js
var db = JSRel.use("xxx", {schema: {
  artist: {name: true},
  song  : {title: true, artist: "artist"}
}});
var btls = db.ins("artist", {name: "the Beatles"});
db.ins("song", {title: "Help!", artist: btls});
db.ins("song", {title: "In My Life", artist: btls});

var model = {
  getSongsByArtist: function(name) {
    return db.find("artist", {name : name}, {join: "song", select : "song"});
  }
};
standalone(model);
```

In master.js, we can use "getSongsByArtist" asynchronously, catching possible errors in err.

In Node.js, **standalone** spawns a child process.

In browsers, **standalone** creates a WebWorker instance.

### environmental specific code ###

Because Node.js and WebWorker has a different requiring system,
We must be careful of loading scripts.


in Node.js (worker.js)

```js
var JSRel = require('jsrel');
var standalone = require('standalone');
```

This is enough.

in browsers (worker.js)

```js
importScripts('/pathto/SortedList.js', '/pathto/jsrel.js', '/pathto/standalone.js');
```

Don't forget to import **[SortedList](https://github.com/shinout/SortedList)** (which JSRel depends on). 


LICENSE
-------
(The MIT License)

Copyright (c) 2012 SHIN Suzuki <shinout310@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
