#!/usr/bin/env node

console.log("\n\n");

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
}).listen(config.WebServer.HTTPport)
console.log("listening on port " + config.WebServer.HTTPport)

/**********************\
| Sockets and Emitters |#######################################################
\**********************/    //Websockets
//Object.keys(results)
var io = require('socket.io').listen(server); //Create websocket server
io.sockets.emit('disconnect'); // Renew old connections that still exist

/**********************\
| SocketMessageQueue |#######################################################
\**********************/// WebsocketsQueue / EmitterQueue

var SMQ = {
    /* SocketMessageQueue / EmitterQueue */
    "ServerOnlineSeconds": 0,
    "ServerOnlineSecondsMilli": 0, 
 
    "Message": {
        "Content": {},
        "Id" : 0,
        "Queue" :{},
        "Add": function (sKey, sValue) {
            if (SMQ.Message.Content[sKey] !== undefined) SMQ.Queue.Send(); //Send the message when the sKey already exists, we don't updates values in an existing message.
            SMQ.Message.Content[sKey] = sValue; //Add the value
        },
        "Reset": function () {
            SMQ.Message.Content = {};
        },
        "Init": function () {
            
            //Reset all values to there defaults
            SMQ.Message.Reset();

            //Set here the default options for a new message
            SMQ.Message.Id++;
        }   
    },
    "Queue":
    {
        "Time" : 0,
        "TimeLimit" : 15000, // The maximum time that a message can be in the queue  //config.WebServer.HTTPport
        "Send": function () {

            //Add the current QueueTime of this message to the message
            SMQ.Message.Queue.Time = SMQ.Queue.Time;

            //Send the message
            io.sockets.emit("JSONforClient", SMQ.Message);
    
            //Reset the QueueTimer
            SMQ.Timer.Reset()
        }
    },
    "Timer":
    {
        "Process": "",  //Used to bind the Timer
        "Enabled": false,   //Used to cache the status
        "Check": function () {  //Used to check the status
            SMQ.Timer.Enabled = typeof SMQ.Timer.Process === 'function';
            process.stdout.write(" Timer Check - Found: " + SMQ.Timer.Enabled);
            return SMQ.Timer.Enabled;
        },
        "Clear": function () {  //Used to clear the existing Timer
            clearInterval(SMQ.Timer.Process);
            SMQ.Queue.Time = 0;
            process.stdout.write("\nTimer Clear " + (SMQ.Timer.Check() ? " Failed! " : " Ok! "));
        },
        "Create": function () { //Used to create a new Timer
            if (!SMQ.Timer.Check()) {
                //Empty/Init the New message
                SMQ.Message.Init();    
                SMQ.Timer.Process = setInterval(

                    //setInterval meets the QueueTime condition.
                    function () {

                        //Options for messages that are send because of queueTime condtion.
                        SMQ.Message.Queue.TimeLimit = SMQ.Queue.TimeLimit;
                        SMQ.Message.Queue.TimeLimitReached = true;       

                        //This message does reach the QueueTime limit.
                        SMQ.Queue.Send();
                    },
                    SMQ.Queue.TimeLimit
                );
                console.log(" Timer Create " + SMQ.ServerOnlineSeconds);
            }
        },
        "Reset": function () {  //Used to reset the Timer
            SMQ.Timer.Clear(); //Clear old Timer
            SMQ.Timer.Create();   //Start new Timer
        },
    }
};

//Emit values on page refresh or first load
io.sockets.on('connection', function (socket)
{
    process.stdout.write("\nclient connected");
    
    socket.emit('request', /* */); // emit an event to the socket
    io.emit('broadcast', /* */); // emit an event to all connected sockets
    socket.on('reply', function(){ /* */ }); // listen to the event

    SMQ.Queue.Send();
});

//Timers
if(config.System.ServerOnlineSecondsEnabled)setInterval(function(){ io.sockets.emit("ServerOnlineSeconds", SMQ.ServerOnlineSeconds++ ); }, 1000);
if(config.System.ServerOnlineSecondsMilliEnabled)setInterval(function(){ io.sockets.emit("ServerOnlineSecondsMilli", SMQ.ServerOnlineSecondsMilli++ ); }, 1);
//SocketMessageQueueTime
setInterval(function(){ io.sockets.emit("SocketMessageQueueTime", SMQ.Queue.Time++ ); }, 1);
//Item for -> Meta and duplicate key for test
//setInterval(function(){ SMQ.Queue.Add("TestKey","TestVal"); }, 2000);

function emitterUpdate(emitterName, emitterValue)
{
    process.stdout.write("\n Socket Emitter Update -> [ " + emitterName + " ] ");
    io.sockets.emit('init', emitterName);
    io.sockets.emit(emitterName, emitterValue);

    //Debug
    SMQ.Message.Add(emitterName,emitterValue)
}

/**************\
| MYSQL Client |###############################################################
\**************/    //SQL Query's
var mysql = require('mysql');
var con = mysql.createConnection({
    multipleStatements: true,
    host: config.MySQL.Server.DBhost,
    user: config.MySQL.Server.DBuser,
    password: config.MySQL.Server.DBpass,
    port: config.MySQL.Server.DBport,
});

//SQL Query - fetch all databasesnames from server except the ones that are denied within the config file
function mysqlGetDatabases(return_Value_DB) {
    //Query execute = get all databases from host
    con.query("SHOW DATABASES", function (err, results)  //Object.keys(results).length
    {
        if (err) throw err;//Throw on error

        for (var i = 0; i < results.length; i++) {//Object.keys(results).length

            if (results[i]["Database"] === undefined) continue;

            //if databaseName exist in config.MySQL.Server.DBdenied or if databaseName not exist in config.MySQL.Server.DBaccepted
            if (config.MySQL.Server.DBdenied.indexOf(results[i]["Database"]) > -1 || config.MySQL.Server.DBaccepted.indexOf(results[i]["Database"]) == -1) 
            {
                delete results[i]["Database"];
            }
            else {
                return_Value_DB(results[i]["Database"]); //Callback query result item
            }
        }
    })
}
//SQL Query - fetch all tables by database
function mysqlGetTables(DBname, return_Value_Table)
{    
    var sql = "SELECT TABLE_NAME FROM information_schema.tables WHERE TABLE_SCHEMA ='" + DBname + "';";//Query = get all column names from table

    con.query(sql, function (err, results) {//Query execute

        if (err) throw err;//Throw on error

        for (var i = 0; i < results.length; i++)//Object.keys(results).length
        {  
            return_Value_Table(results[i]["TABLE_NAME"]); //Callback query result item
        }
    })
}
//SQL Query - fetch all columns by database and table
function mysqlGetColumns(DBname, DBtable, return_Value_Column)
{
    var sql = "SELECT COLUMN_NAME FROM information_schema.columns WHERE TABLE_SCHEMA = '" + DBname + "' AND TABLE_NAME = '" + DBtable + "';";//Query = get all column names from table

    con.query(sql, function (err, results) {//Query execute

        if (err) throw err;//Throw on error

        for (i = 0; i < results.length; i++)//Object.keys(results).length
        {   
            return_Value_Column(results[i]["COLUMN_NAME"]); //Callback query result item
        }
    })

}
//SQL Query - fetch (last-by-id-column) cellValue by database, table and column
function mysqlGetValue(DBname, DBtable, sColumn, return_Value_Cell)
{
    var sql = "SELECT `" + sColumn + "` FROM `" + DBname + "`.`" + DBtable + "` WHERE `" + sColumn + "` IS NOT NULL ORDER BY `id` DESC LIMIT 1;";//Query = get last value by id from column
    
    con.query(sql, function (err, results) {//Query execute

        if (err) throw err;//Throw on error

        for (i = 0; i < results.length; i++)
        {
            //Emit value to socket
            emitterUpdate(DBname + "_" + DBtable + "_" + sColumn, results[i][sColumn]);
            return_Value_Cell(results[i][sColumn]); //Callback query result item
        }
    })
}

mysqlGetDatabases(   //<--- This function finished, do somthing with results(return_Value_DB).

    function (return_Value_DB) {
        mysqlGetTables(   //<--- This function finished, do somthing with results(return_Value_Table).

            return_Value_DB,
            function (return_Value_Table) {
                mysqlGetColumns(   //<--- This function finished, do somthing with results(return_Value_Column).

                    return_Value_DB,
                    return_Value_Table,
                    function (return_Value_Column) {

                        //Init each columnName/itemName as emiter for client
                        var emitterName = return_Value_DB + "_" + return_Value_Table + "_" + return_Value_Column;

                        //Init this value when it meets the config requirements
                        if (config.MySQL.Server.MySQLEventSkip.indexOf(emitterName) === -1) {

                            mysqlGetValue(   //<--- This function finished, do somthing with results(return_Value_Cell).
                                return_Value_DB,
                                return_Value_Table,
                                return_Value_Column,
                                function (return_Value_Cell) {
                                    process.stdout.write(" -> ( " + return_Value_Cell + " ) ");
                                }
                            )
                        }
                    }
                )
            }
        );
    }
);

/**************\
| MySQL events |###############################################################
\**************/    //Will be triggered on MySQL events

const MySQLEvents = require('@rodrigogs/mysql-events');

const MySQLEventsInit = async () => {

    const instance = new MySQLEvents({
        host: config.MySQL.Server.DBhost,
        user: config.MySQL.Server.DBuser,
        password: config.MySQL.Server.DBpass,
        port: config.MySQL.Server.DBport
    }, {
            serverId: 1,
            startAtEnd: true,
            excludedSchemas: {
                mysql: true,
            },
        });

    await instance.start();

    //add a trigger for sql event (database separated)
    instance.addTrigger({
        name: 'Whole database instance',
        expression: '*',//<-- all databases
        statement: MySQLEvents.STATEMENTS.ALL,
        onEvent: (event) => {

            if(config.MySQL.Server.DBdenied.indexOf(event.schema) > -1)return;
            else if(config.MySQL.Server.DBaccepted.indexOf(event.schema) === -1)return;

            for (var iPos = 0; iPos < event.affectedColumns.length; iPos++) //for all columns in event.affectedColumns[]
            {
                var emitterName = event.schema + "_" + event.table + "_" + event.affectedColumns[iPos]; //The emitterName
                if (config.MySQL.Server.MySQLEventSkip.indexOf(emitterName) < 0) //if emitterName not exist in config.MySQL.Server.MySQLEventSkip
                {
                    //Only call this function, skip double/useless actions.
                    mysqlGetValue(   //<--- This function finished, do somthing with results(return_Value_Cell).
                        event.schema, 
                        event.table, 
                        event.affectedColumns[iPos],
                        function () { process.stdout.write(" -> < " + event.timestamp + " > "); });//no process of callback, the value is already set inside this function.
                }
            }
        },
    });
    
    //MySQLEvents class emits some events related to its MySQL connection and ZongJi instance
    instance.on(MySQLEvents.EVENTS.CONNECTION_ERROR, console.error);
    instance.on(MySQLEvents.EVENTS.ZONGJI_ERROR, console.error);
};

MySQLEventsInit()
.then(() => console.log('Waiting for database events...'))
.catch(console.error);
