var Transform = require('stream').Transform

function through(options, write, end) {
  var s = Transform(options)
  s._transform = write || function (buf, enc, next) {
    next(null, buf)
  }
  s._flush = end
  s.setLabel = function (name) {
    s.label = name
  }
  return s
}

module.exports = function (write, end) {
  return through({}, write, end)
}
module.exports.obj = function (write, end) {
  return through({ objectMode: true }, write, end)
}

