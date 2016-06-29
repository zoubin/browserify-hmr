var has = require('./lib/has')
//var State = require('./lib/state')

/*
function main1(global, moduleDefs, cachedModules) {
  if (!global._hmr) {
    var conf = require('./lib/conf.json')
    global._hmr = {
      state: new State({
        updateUrl: conf.url,
        ignoreUnaccepted: conf.ignoreUnaccepted,
        updateCacheBust: conf.updateCacheBust,
        moduleMeta: conf.moduleMeta,
        moduleDefs: moduleDefs,
        cachedModules: cachedModules,
      }),
    }
  }

  var hmr = global._hmr
  var state = hmr.state
  var modules = [moduleDefs]

  module.exports = function (originalFn, defs, key) {
    if (modules.indexOf(defs) === -1) {
      for (var k in defs) {
        if (has(defs, k)) {
          moduleDefs[k] = [ originalFn, defs[k][1] ]
        }
      }
      modules.push(defs)
    }
    require(state.toIndex(key))
  }
}
*/

// if we use the identify `global` in this file,
// browserify will wrap the source code as the body of a function which provides an argument named `global` ,
// and that will make the original `arguments` inaccessible.
// to avoid the wrapping,
// move the `global` identify into a different module and require it to access the global object
var glb = require('./lib/global')
var moduleDefs = arguments[4]
var cachedModules = arguments[5]

if (!glb._hmr) {
  var conf = require('./lib/conf.json')
  var modules = [moduleDefs]
  var moduleMeta = conf.moduleMeta
  glb._hmr = {
    modules: moduleDefs,
    cache: cachedModules,
    bundle: { initModule: function () {} },
    initModule: function (name, module) {
      this.bundle.initModule.apply(this.bundle, arguments)
    },
    initBundle: function (defs) {
      if (modules.indexOf(defs) > -1) return
      for (var k in defs) {
        if (has(defs, k)) {
          moduleDefs[k] = defs[k]
        }
      }
      modules.push(defs)
    },
    runInNewContext: function (originalFn, index, ctx, args) {
      var defs = args[4]
      if (defs === moduleDefs) {
        originalFn.apply(ctx, args)
      } else {
        this.initBundle(defs)
        moduleDefs[index] = [originalFn, defs[index][1]]
        // run all modules in the bundle context of this module
        require(index)
      }
    },
  }
  require('./inc')(
    moduleDefs, cachedModules, moduleMeta,
    conf.updateUrl, 'websocket', ['websocket'],
    conf.ignoreUnaccepted, conf.updateCacheBust,
    'bundle', require('socket.io-client')
  )
}
module.exports = glb._hmr
