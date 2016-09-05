var static = require('node-static');
var http = require('http');
// Create a node-static server instance
var file = new(static.Server)();
var app = http.createServer(function (req, res) {
    file.serve(req, res);
}).listen(8181);

channelsDict = {};

var io = require('socket.io').listen(app);

console.log('Waiting for requests...')
io.sockets.on('connection', function (socket){
    console.log('New conexion from ' + socket.id);

    // Message received from a client
    socket.on('message', function(message){
        console.log('Received message');
        socket.broadcast.to(channelsDict[socket.id]).emit('message', message);
        console.log('broadcasted to everyone in ' + channelsDict[socket.id])
    });

    // Message to create or join a room
    socket.on('create or join', function(room){
        var channelRoom = io.sockets.adapter.rooms[room];
        var numClients = channelRoom ? channelRoom.length: 0;

        // First client joining...
        if (numClients == 0){
            console.log('Request for creating the room ' + room);
            socket.join(room);
            socket.emit('created', room);
            channelsDict[socket.id] = room;
        } else if (numClients == 1) {
            console.log('Request for joining the room ' + room);
            io.sockets.in(room).emit('join', room);
            socket.join(room);
            socket.emit('joined', room);
            channelsDict[socket.id] = room;
        } else {
            console.log('Request for joining a full room: ' + room)
            socket.emit('full', room);
        }
    });
});
