#!/usr/bin/env node

//The config file
var config = require('./.config.json');

/***************\
| NodeJS Server |##############################################################
\***************/   //Webserver

var http = require('http');

/* Advanced HTTP server - Read and send index.html file */
var url = require('url');
var fs = require('fs');
var path = require('path');
var baseDirectory = __dirname;   // or whatever base directory you want
server = http.createServer(function (request, response) {

    //console.log(request.url)
    try {

        if (request.url == '/') {
            request.url = '/index.html';
        }
        var requestUrl = url.parse(request.url)

        // need to use path.normalize so people can't access directories underneath baseDirectory
        var fsPath = baseDirectory + path.normalize(requestUrl.pathname)

        var fileStream = fs.createReadStream(fsPath)
        fileStream.pipe(response);
        fileStream.on('open', function () {
            //response.writeHead(200)
            response.writeHead(200, { 'Content-type': 'text/html' });
        })
        fileStream.on('error', function (e) {
            response.writeHead(404);     // assume the file doesn't exist
            response.end();
        })
    } catch (e) {
        response.writeHead(500);
        response.end();     // end the response so browsers don't hang
        //console.log(e.stack)
    }
}).listen(config.HTTPport)
console.log("listening on port " + config.HTTPport)

/**********************\
| Sockets and emitters |#######################################################
\**********************/    //Websockets

var io = require('socket.io').listen(server);

//Emit values on page refresh or first load
io.sockets.on('connection', function (socket) {
    mysqlInit(config.DBname, config.DBtable); // CHANGE later, instead of a static value
});

/**************\
| MYSQL Client |###############################################################
\**************/    //SQL Query's

var mysql = require('mysql');

//Init MySQL columns and emit there last value on first website visit or refresh, 
function mysqlInit(DBname,DBtable) {

    mysqlGetColumns(DBname, DBtable, function (callbackResult) {

        var objectLength = callbackResult.length;

        for (var i = 0; i < objectLength; i++) {
            mysqlGetValue(DBname,DBtable,callbackResult[i]["COLUMN_NAME"]);
        }
    });
}

//SQL Query - fetch last value by columnName
function mysqlGetValue(DBname,DBtable,sColumn) {

    var con = mysql.createConnection({
        multipleStatements: true,
        host: config.DBhost,
        user: config.DBuser,
        password: config.DBpass,
        port: config.DBport,
    });

    con.connect(function (err) {

        //Throw on error
        if (err) throw err;

        //Query = get last value by id from column
        var sql = "SELECT `" + sColumn + "` FROM `" + DBname + "`.`" + DBtable + "` WHERE `" + sColumn + "` IS NOT NULL ORDER BY `" + sColumn + "` DESC LIMIT 1;";

        //Query execute
        con.query(sql, function (err, results) {
            if (err) throw err;

            console.log("mysqlGetValue -> " + sColumn + " = " + results[0][sColumn]);
            io.sockets.emit(sColumn, results[0][sColumn]);
        })
    });
}

//SQL Query - fetch all columns in table
function mysqlGetColumns(DBname, DBtable, callback) {

    var con = mysql.createConnection({
        multipleStatements: true,
        host: config.DBhost,
        user: config.DBuser,
        password: config.DBpass,
        port: config.DBport,
    });

    con.connect(function (err) {

        //Throw on error
        if (err) throw err;

        //Query = get all column names from table
        var sql = "SELECT COLUMN_NAME FROM information_schema.columns WHERE TABLE_SCHEMA = '" + DBname + "' AND TABLE_NAME = '" + DBtable + "';";

        //Query execute
        con.query(sql, function (err, results) {

            //Throw on error
            if (err) throw err;

            //Object with results
            console.log("mysqlGetColumns -> " + JSON.stringify(results));

            //Get the amount of columns in table
            var objectLength = Object.keys(results).length;

            //Init each columnName/itemName as emiter for client
            for (i = 0; i < objectLength; i++) {
                io.sockets.emit('init', results[i]["COLUMN_NAME"]);
            }

            //return this query results
            return callback(results);
        })
    });
}

/**************\
| MySQL events |###############################################################
\**************/    //Will be triggered on MySQL events

const MySQLEvents = require('@rodrigogs/mysql-events');

const program = async () => {

    const instance = new MySQLEvents({
        host: config.DBhost,
        user: config.DBuser,
        password: config.DBpass,
        port: config.DBport,
    }, {
            serverId: 1,
            startAtEnd: true,
            excludedSchemas: {
                mysql: true,
            },
        });

    await instance.start();

    //add a trigger for sql event
    instance.addTrigger({
        name: 'Whole database instance',
        expression: 'testDB.testTable',
        statement: MySQLEvents.STATEMENTS.ALL,
        onEvent: (event) => {

            var objectLength = Object.keys(event.affectedColumns).length;

            for (var i = 0; i < objectLength; i++) {
                mysqlGetValue(config.DBname, config.DBtable,event.affectedColumns[i]);// CHANGE later, instead of a static value
            }

        },
    });

    //MySQLEvents class emits some events related to its MySQL connection and ZongJi instance
    instance.on(MySQLEvents.EVENTS.CONNECTION_ERROR, console.error);
    instance.on(MySQLEvents.EVENTS.ZONGJI_ERROR, console.error);
};

program()
    .then(() => console.log('Waiting for database events...'))
    .catch(console.error);