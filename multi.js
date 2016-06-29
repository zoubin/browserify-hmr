var path = require('path')
var crypto = require('crypto')
var through = require('./lib/through')
var State = require('./lib/state')
var CONF_PATH = require.resolve('./lib/conf.json')
var HMR = require('./package.json').name
var browserHMR = path.join(__dirname, 'browser.js')

function syncModuleData(b, state, moduleData) {
  var opts = state.options

  var dataRow
  function write(row, enc, next) {
    if (state.resolve(row.file) === CONF_PATH) {
      dataRow = row
      return next()
    }
    next(null, row)
  }

  function end(next) {
    dataRow.source = 'module.exports = ' + JSON.stringify({
      updateUrl: opts.url || null,
      ignoreUnaccepted: opts.ignoreUnaccepted !== false,
      updateCacheBust: !!opts.updateCacheBust,
    }, null, 2)
    this.push(dataRow)
    state.createSocketServer(b, state).then(function (server) {
      b.once('confirmNewModuleData', next)
      server.send({
        type: 'setNewModuleData',
        moduleData: moduleData,
      })
    })
  }

  b.pipeline.get('label').push(through.obj(write, end))
}

function hashStr(str) {
  var hasher = crypto.createHash('sha256')
  hasher.update(str)
  return hasher.digest('base64').slice(0, 20)
}

function isHMRcode(file) {
  var dir = path.dirname(file)
  if (!startsWith(dir, __dirname) || path.extname(file) === '.json') {
    return false
  }
  return !startsWith(dir, path.join(__dirname, 'example'))
}

function startsWith(str, sub) {
  return str.substring(0, sub.length) === sub
}

function initModule(b, state) {
  var moduleData = Object.create(null)
  var rows = []
  var indexMap = {}

  // collect dependents
  b.pipeline.get('deps').push(through.obj(function(row, enc, next) {
    var name = state.relative(row.file)
    var data = moduleData[name]
    data.dependents = []
    Object.keys(row.deps).forEach(function (dep) {
      // dependencies that aren't included in the bundle have the name false
      if (row.deps[dep]) {
        moduleData[state.relative(row.deps[dep])].dependents.push(name)
      }
    })
    next(null, row)
  }))

  var browserHMRModules = {}
  browserHMRModules[browserHMR] = true

  // apply the hash-index and disable dedupe
  b.pipeline.get('dedupe').unshift(through.obj(function (row, enc, next) {
    delete row.dedupe
    delete row.dedupeIndex

    var name = state.relative(row.file)
    var index = name + ';' + hashStr(row.source)

    if (!isHMRcode(row.file)) {
      moduleDefs[index] = [row.source, row.deps]
      row.source = 'require(' + JSON.stringify(HMR) + ').run(' + JSON.stringify(index) + ', arguments);\n'
      row.deps = {}
      row.deps[HMR] = browserHMR
    }

    indexmap[row.file] = index
    row.index = index
    rows.push(row)
    next()
  }, function (next) {
    var hmrIndex = indexmap[browserHMR]
    rows.forEach(function (row) {
      row.indexDeps = {}
      Object.keys(row.deps).forEach(function (key) {
        var file = row.deps[key]
        row.indexDeps[key] = indexMap[file]
      })
      this.push(row)
    }, this)

    next()
  }))

  return moduleData
}

module.exports = function (b, opts) {
  opts = opts || {}
  var basedir = opts.basedir || b._options.basedir || process.cwd()
  var state = new State(basedir, opts)
  b.add(browserHMR)
  function hook() {
    state.reset()
    var moduleData = initModule(b, state)
    syncModuleData(b, state, moduleData)
  }

  b.on('reset', hook)
  hook()
}

