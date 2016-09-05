'use strict';

// For development I have this server.
// It isn't very reliable, it's in a Raspberry pi.
// Consider to build your own server.
var SIGNALING_SERVER = 'https://webcam.merpi.tk';
var VERSION = 'v0.5.2';

// webrtc structures
var localStream, remoteStream = undefined, undefined;
var pc;

// Global variables for managing the connection
var ChannelReady = false; // Two peers are in the same room
var FirstPeer = false; // This is the first peer entering the room?
var Started = false; // Does the communication started?

var localVideo = document.querySelector('#localVideo');
var remoteVideo = document.querySelector('#remoteVideo');

// RTCPeerConnection configuration
var pcConfig = {'iceServers': [{'url':'stun:stun.l.google.com:19302'},
                               {'url':'stun:stun1.l.google.com:19302'},
                               {'url':'stun:stun2.l.google.com:19302'},
                               {'url':'stun:stun3.l.google.com:19302'},
                               {'url':'stun:stun4.l.google.com:19302'}]};

// Required for Firefox and Chrome to interoperate
var pcConstraints = {
    'optional': [{'DtlsSrtpKeyAgreement': true}]
};

// Offer the other peer that you want audio and video
var sdpConstraints = {};

// getUserMedia constraints
var mediaConstraints = {video: true, audio: true};

// Signaling server socket
var srvSocket;

var room;

// For managing logging and can disable it
function log(msg) {
    //alert(msg);
    console.log(msg);
}

// For sending messages to the other peer
// throw the signaling server
function send(msg) {
    console.log('Sending message: ',msg)
    //console.log('Sending message: ', msg);
    srvSocket.emit('message', msg);
}

//------ BEGINING OF ALL ------//

$(document).ready(function(){
    $('#version').html(VERSION);
    attachBtns();
    hideVideosLayer();
    srvSocket = io.connect(SIGNALING_SERVER);
    attachMsgsHandlers();
    $('#submit-room').click(function(e){
        room = $('#room-id').val();
        if (room) {
            $('#roomName').html('Room name: ' + room);
            srvSocket.emit('create or join', room);
            showVideosLayer();
        }
    });
});

function hideVideosLayer(){
    $('#videoContainer').hide();
    $('#roomContainer').show();
}

function showVideosLayer(){
    $('#roomContainer').hide();
    $('#videoContainer').show();
}

function loadRemoteStatus(loading) {
    if (loading) {
        $('#loadRemote').show();
    } else {
        $('#loadRemote').hide();
    }
}

function loadLocalStatus(loading) {
    if (loading) {
        $('#loadLocal').show();
    } else {
        $('#loadLocal').hide();
    }
}

function attachBtns() {
    $('#mute').click(function(e){
        var muted = $('#remoteVideo').prop('muted');
        // Change the state
        if (muted){
            $('#mute').removeClass('activated');
            $('#mute').html('<span class="glyphicon glyphicon-volume-up"></span>');
        } else {
            $('#mute').addClass('activated');
            $('#mute').html('<span class="glyphicon glyphicon-volume-off"></span>');
        }
        $('#remoteVideo').prop('muted', !muted);
        console.log("Muted?: " + $('#remoteVideo').prop('muted'));
    });

    $('#closeBtn').click(function(e){
        closeConnection();
    });
}

function showWarning(message) {
    $('<div class="alert alert-warning alert-dismissible fade in" role="alert">' +
            '<span class="glyphicon glyphicon-exclamation-sign" aria-hidden="true"></span> ' +
            '<button type="button" class="close" data-dismiss="alert" aria-label="Close"><span aria-hidden="true">×</span></button>' +
            message + '</div>')
        .appendTo('#alertsBox')
        .delay(4000).hide(500, function() {
            console.log("entra");
            console.log($('#alertsBox'));
            $('#alertsBox').children(':hidden').alert('close');
        });
}

function closeConnection () {
    hideVideosLayer();
    loadLocalStatus(true);
    loadRemoteStatus(true);
    hangup();
}

function attachMsgsHandlers(){
    // This peer has created the room
    srvSocket.on('created', function(room){
        showVideosLayer();
        log('You have created the room ' + room);
        FirstPeer = true;
        // If the other peer is faster and I don't wait here,
        // the communication never starts.
        /*navigator.getUserMedia(mediaConstraints, handleUserMedia, handleUserMediaError);
        console.log('Getting user media with constraints', mediaConstraints);
        checkAndStart();*/
        navigator.mediaDevices.getUserMedia(mediaConstraints)
        .then(handleUserMedia)
        .then(checkAndStart())
        .catch(handleUserMediaError);
    });

    // This peer has joined the room
    srvSocket.on('joined', function(room){
        showVideosLayer();
        log('You have joined the room ' + room);
        ChannelReady = true;
        /*navigator.getUserMedia(mediaConstraints, handleUserMedia, handleUserMediaError);*/
        navigator.mediaDevices.getUserMedia(mediaConstraints)
        .then(handleUserMedia)
        .catch(handleUserMediaError);
    });

    // This peer arrived late
    srvSocket.on('full', function(room){
        showWarning('Late, the room ' + room + ' is full');
        closeConnection();
    });

    // Another peer has joined the room
    srvSocket.on('join', function(room){
        log('Another peer has joined the room, wait');
        ChannelReady = true;
    });

    // Log received from the server
    // TODO: delete this method
    srvSocket.on('log', function(array){
        log("¡From server!: " + array);
    });

    // Message from the other peer
    srvSocket.on('message', function (msg) {
        console.log('Received message: ', msg);

        // The other peer is ready to start.
        if (msg == 'got user media'){
            checkAndStart();
        // The starter peer began, my turn.
        } else if (msg.type == 'offer'){
            if (!FirstPeer && !Started)
                checkAndStart();
            pc.setRemoteDescription(new RTCSessionDescription(msg));
            answer();
        // The remote peer answered my offer.
        } else if (msg.type == 'answer' && Started) {
            pc.setRemoteDescription(new RTCSessionDescription(msg));
        // New candidate message
        } else if (msg.type == 'candidate' && Started) {
            var candidate = new RTCIceCandidate(
                                {sdpMLineIndex:msg.label,
                                candidate:msg.candidate});
            pc.addIceCandidate(candidate);
        // Bye bye
        } else if (msg == 'bye') {
            if (Started) {
                showWarning("Your partner closed the conexion");
                closeConnection();
            }
        }
    });
}

function attachMediaStream(video, stream) {
    if (window.URL){
        video.src = URL.createObjectURL(stream);
    } else {
        video.src = stream;
    }
}

// When user media is obtained
function handleUserMedia(stream) {
    console.log('got user media ', stream);
    loadLocalStatus(false);
    localStream = stream;
    attachMediaStream(localVideo, stream);
    //$('#localVideo').attr('src', URL.createObjectURL(stream));
    log('Adding local stream.');
    send('got user media');
}

// When user media is not obtained because an error
function handleUserMediaError(error){
    console.log('Error obtaining user media: ', error);
    showWarning('Error obtaining user media');
    closeConnection();
    log('Error obtaining user media');
}

// Create peer connection and call if is the first peer
function checkAndStart() {
    if (!Started && localStream && ChannelReady){
        createPeerConnection();
        Started = true;
        if (FirstPeer)
            call();
    }
}



// Create a peer connection
function createPeerConnection() {
    // Create the connection and add my stream
    log('creating peer con');
    pc = new RTCPeerConnection(pcConfig, pcConstraints);
    pc.addStream(localStream);
    // Send ICE candidate to the other peer
    pc.onicecandidate = function (e) {
        console.log('ICE candidate: ', e);
        if(e.candidate){
            send({type: 'candidate',
                  label: e.candidate.sdpMLineIndex,
                  id: e.candidate.sdpMid,
                  candidate: e.candidate.candidate});
        }else{
            log("There aren't more candidates");
        }
    };

    /* NOT SUPPORTED
    pc.ontrack = function(e){
        // Should be remote video stream
        if (remoteStream){
            remoteStream.addTrack(e.track);
        } else {
            alert('no meida stream')
            remoteStream = new MediaStream(); // Not supported in Mobiles
            alert('new stream')
            remoteStream.addTrack(e.track);
            alert('stream added')
        }
        alert('track' + remoteStream);
	      $('#remoteVideo').attr('src', URL.createObjectURL(remoteStream));
    };
    */

    pc.onaddstream = function(e){
        log('remote stream', e.stream);
        loadRemoteStatus(false);
        attachMediaStream(remoteVideo, e.stream);
        remoteStream = e.stream;
        //$('#remoteVideo').attr('src', URL.createObjectURL(remoteStream));
        log('added remote stream2');
    }

    pc.onremovestream = function (e) {
        log('Remote stream dettached: ', e)
    }

    //alert('created peer con')
}

/*function handleIceCandidate (e) {
    console.log('ICE candidate: ', e);
    if(e.candidate){
        send({type: 'candidate',
              label: e.candidate.sdpMLineIndex,
              id: e.candidate.sdpMid,
              candidate: e.candidate.candidate});
    }else{
        log("There aren't more candidates");
    }
}*/

// Create a offer for the other node
function call(){
    log('Creating offer...');
    pc.createOffer(setLocalAndSendMessage, onSignalingError, sdpConstraints);
    /*pc.createOffer(sdpConstraints)
    .then(function(offer){
        return pc.setLocalDescription(offer);
    })
    .then(function(){
        send(pc.localDescription);
    })
    .catch(function(error){
        console.log('Error call: sending offer: ', error);
    });*/
}

// Answer the call
function answer() {
    log('Answering offer...');
    pc.createAnswer(setLocalAndSendMessage, onSignalingError, sdpConstraints);
}

function setLocalAndSendMessage(sessionDescription) {
    pc.setLocalDescription(sessionDescription);
    send(sessionDescription);
}

function onSignalingError(error) {
    log('Error signaling message: ' + error);
}

function detachStream(video){
    video.pause();
    video.src = '';
    video.load();
}

function hangup() {
    console.log('Hanging up...');
    if (Started) {
        send('bye');
    }
    Started = false;
    if (pc)
        pc.close();
    pc = null;
    remoteStream, localStream = null, null;
    detachStream(localVideo);
    detachStream(remoteVideo);
}
