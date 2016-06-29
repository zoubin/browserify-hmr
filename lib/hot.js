var has = require('./has')
var StrSet = require('./str-set')

function Hot(name, state) {
  this.state = state
  this.name = name
  this.data = state.runtimeModuleInfo[name].disposeData
}

Hot.prototype.accept = function (deps, cb) {
  var name = this.name
  var state = this.state
  var runtimeModuleInfo = state.runtimeModuleInfo
  var runtimeInfo = runtimeModuleInfo[name]

  if (typeof deps === 'function') {
    cb = deps
    deps = null
  }
  if (!deps) {
    return runtimeInfo.selfAcceptCbs.push(cb)
  }

  if (typeof deps === 'string') {
    deps = [deps]
  }

  var depNames = new StrSet()
  var moduleDef = state.moduleDefs[runtimeInfo.index]
  for (var i = 0, depsLen = deps.length; i < depsLen; i++) {
    var depIndex = moduleDef[1][deps[i]]
    var depName = state.getRuntimeName(depIndex)
    if (depIndex === undefined || !depName) {
      throw new Error('File does not use dependency: ' + deps[i])
    }
    depNames.add(depName)
  }

  deps = null
  depNames.forEach(function(depName) {
    runtimeModuleInfo[depName].accepters.add(name)
    runtimeInfo.accepting.add(depName)
  })
  if (cb) {
    state.updateHandlers.push({
      accepter: name,
      deps: depNames,
      cb: cb,
    })
  }
}

Hot.prototype.decline = function (deps) {
  var name = this.name
  var state = this.state
  var runtimeModuleInfo = state.runtimeModuleInfo
  var runtimeInfo = runtimeModuleInfo[name]

  if (!deps) { // self
    runtimeInfo.decliners.add(name)
    runtimeInfo.declining.add(name)
    return
  }

  if (typeof deps === 'string') {
    deps = [deps]
  }
  var moduleDef = state.moduleDefs[runtimeInfo.index]
  for (var i = 0, depsLen = deps.length; i < depsLen; i++) {
    var depIndex = moduleDef[1][deps[i]]
    var depName = state.getRuntimeName(depIndex)
    if (depIndex === undefined || !depName) {
      throw new Error('File does not use dependency: ' + deps[i])
    }
    runtimeModuleInfo[depName].decliners.add(name)
    runtimeInfo.declining.add(depName)
  }
}

Hot.prototype.dispose = function (cb) {
  return this.addDisposeHandler(cb)
}

Hot.prototype.addDisposeHandler = function (cb) {
  var runtimeInfo = this.state.runtimeModuleInfo[this.name]
  runtimeInfo.disposeHandlers.push(cb)
}

Hot.prototype.removeDisposeHandler = function (cb) {
  var runtimeInfo = this.state.runtimeModuleInfo[this.name]
  var ix = runtimeInfo.disposeHandlers.indexOf(cb)
  if (ix > -1) {
    runtimeInfo.disposeHandlers.splice(ix, 1)
  }
}

Hot.prototype.check = function () {}

Hot.prototype.apply = function (options, cb) {
  this.state.apply(options, cb)
}

Hot.prototype.status = function (cb) {
  if (cb) {
    return this.addStatusHandler(cb)
  }
  return this.state.status
}

Hot.prototype.addStatusHandler = function (cb) {
  this.state.statusHandlers.push(cb)
}

Hot.prototype.removeStatusHandler = function (cb) {
  var state = this.state
  var ix = state.statusHandlers.indexOf(cb)
  if (ix > -1) {
    state.statusHandlers.splice(ix, 1)
  }
}

Hot.prototype.setUpdateMode = function () {}

