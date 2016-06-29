var fs = require('fs')
var path = require('path')
var cproc = require('child_process')

function State(basedir, opts) {
  this.basedir = basedir
  this.options = opts
  this.server = null
  this.relativeCache = null
}

State.prototype.resolve = function (filename) {
  return path.resolve(this.basedir, this.relative(filename))
}

State.prototype.relative = function (filename) {
  if (!this.relativeCache[filename]) {
    this.relativeCache[filename] = path.relative(this.basedir, fs.realpathSync(filename))
  }
  return this.relativeCache[filename]
}

State.prototype.createSocketServer = function (b) {
  if (this.server) {
    return this.server
  }
  var opts = this.options
  var self = this
  this.server = new Promise(function (resolve) {
    var server = cproc.fork(path.join(__dirname, 'socket-server.js'))
    server.on('message', function(msg) {
      if (msg.type === 'confirmNewModuleData') {
        b.emit('confirmNewModuleData')
      } else {
        console.warn('[HMR builder] Unknown message type from server:', msg.type)
      }
    })
    server.on('disconnect', function() {
      b.emit('error', new Error("Browserify-HMR lost connection to socket server"))
    })

    self.getTLSOptions().then(function (tlsoptions) {
      server.send({
        type: 'config',
        hostname: opts.hostname || 'localhost',
        port: opts.port || 3123,
        tlsoptions: tlsoptions,
      })
      resolve(server)
    })
  })

  return this.server
}

State.prototype.getTLSOptions = function () {
  var opts = this.options
  var tlsoptions = opts.tlsoptions
  var tlscert = opts.tlscert
  var tlskey = opts.tlskey

  // tlsoptions: {} and undefined have different results when the client try to establish a connection
  var readJobs = []
  if (tlscert) {
    readJobs.push(readFile(tlscert).then(function(data) {
      tlsoptions = tlsoptions || {}
      tlsoptions.cert = data
    }))
  }
  if (tlskey) {
    readJobs.push(readFile(tlskey).then(function(data) {
      tlsoptions = tlsoptions || {}
      tlsoptions.key = data
    }))
  }
  return Promise.all(readJobs).then(function () {
    return tlsoptions
  })
}

State.prototype.reset = function () {
  this.relativeCache = Object.create(null)
}

module.exports = State

