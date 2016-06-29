var express = require('express')
var http = require('http')
var https = require('https')
var socketio = require('socket.io')
var has = require('./has')

function log() {
  var args = [].slice.call(arguments)
  console.log.apply(
    console,
    [new Date().toTimeString(), '[HMR]'].concat(args)
  )
}

var hostname
var port
var tlsoptions
var io
var currentModuleData

function runServer() {
  var app = express()
  var server = tlsoptions ? https.Server(tlsoptions, app) : http.Server(app)
  io = socketio(server)
  io.on('connection', function(socket) {
    socket.on('sync', function(syncMsg) {
      var entries = syncMsg.entries
      log('User connected, syncing entries:', entries.join(','))
      socket.emit('sync confirm', getUpdate(entries, syncMsg.moduleMeta, currentModuleData))
    })
  })
  server.listen(port, hostname, function() {
    log('Listening on '+hostname+':'+port)
  })
}

function setNewModuleData(newModuleData, removedModules) {
  runServer()
  _.assign(currentModuleData, newModuleData)
  removedModules.forEach(function(name) {
    delete currentModuleData[name]
  })
  if (Object.keys(newModuleData).length || removedModules.length) {
    log('Emitting updates')
    io.emit('new modules', {newModuleData: newModuleData, removedModules: removedModules})
  }
}

function same(data1, data2) {
}

function getUpdate(entries, moduleMeta, moduleData) {
}

process.on('message', function(msg) {
  if (msg.type === 'config') {
    hostname = msg.hostname
    port = msg.port
    tlsoptions = msg.tlsoptions
    return
  }

  if (msg.type === 'setNewModuleData') {
    process.send({type: 'confirmNewModuleData'})
    currentModuleData = msg.moduleData
    if (!io) {
      runServer()
    }
    var data = currentModuleData
    if (data && !same(currentModuleData, data)) {
      io.emit('module updates')
    }
    return
  }

  log('Unknow message type', msg.type)
})
process.on('disconnect', function() {
  process.exit(0)
})
