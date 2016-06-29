var StrSet = require('./str-set')
var has = require('./has')

function State(conf) {
  this.updateUrl = conf.url
  this.ignoreUnaccepted = conf.ignoreUnaccepted
  this.updateCacheBust = conf.updateCacheBust

  this.moduleMeta = conf.moduleMeta
  this.moduleDefs = conf.moduleDefs
  this.cachedModules = conf.cachedModules

  // modules with different contents should have different indexes
  // a module should keep its index unchanaged as long as its contents and path remain the same
  this.indexToNameMap = Object.create(null)
  this.updateIndexToNameMap(this.moduleMeta)

  // TODO: addRuntimeInfo for the first time from moduleMeta
  this.runtimeModuleInfo = Object.create(null)
  this.updateRuntimeModuleInfo(this.moduleMeta)

  this.status = 'idle'
  this.updateHandlers = []
  this.statusHandlers = []

  this.isAcceptingMessages = false
  this.isUpdating = false
  this.queuedUpdateMessages = []

  this.newModules = []
  this.removedModules = []
}

State.prototype.updateRuntimeModuleInfo = function (moduleMeta) {
  for (name in moduleMeta) {
    if (has(moduleMeta, name)) {
      this.setRuntimeModuleInfo(name, moduleMeta[name])
    }
  }
}

State.prototype.setRuntimeModuleInfo = function (name, meta) {
  this.runtimeModuleInfo[name] = {
    index: meta.index,
    hash: meta.hash,
    parents: new StrSet(meta.parents),
    module: null,
    disposeData: null,
    accepters: new StrSet(),
    accepting: new StrSet(),
    decliners: new StrSet(),
    declining: new StrSet(),
    selfAcceptCbs: [], // may contain null. nonzero length means module is self-accepting
    disposeHandlers: [],
  }
}

State.prototype.updateIndexToNameMap = function (data) {
  for (var name in data) {
    if (has(data, name)) {
      this.indexToNameMap[data[name].index] = name
    }
  }
}

State.prototype.getExportsFromCache = function (id) {
  for (var i = this.cachedModules.length - 1; i >= 0; i--) {
    if (this.cachedModules[i][id]) {
      return this.cachedModules[i][id]
    }
  }
  return null
}

State.prototype.update = function (newModuleData, removedModules) {
  this.newModules = Object.keys(newModuleData)
  this.removedModules = removedModules.slice()

  this.removedModules.forEach(this.removeModule, this)
  this.newModules.forEach(this.removeModule, this)

  this.newModules.forEach(function (key) {
    var value = newModuleData[key]
    this.moduleMeta[key] = {
      index: value.index,
      hash: value.hash,
      parents: value.parents,
    }
    this.moduleDefs[0][value.index] = [
      function (r, m, e, _u1, _u2, _u3, _u4) {
        module.exports(key, arguments)

        var fn = new Function(
          'require', 'module', 'exports',
          '_u1' + rid, '_u2' + rid, '__u3' + rid, '__u4' + rid,
          value.source
        )
        fn.call(this, require, module, exports, _u1, _u2, _u3, _u4, bundle__filename, bundle__dirname);
      };
    ]
  }, this)
}

State.prototype.removeModule = function (key) {
  var meta = this.moduleMeta[key]
  if (!meta) {
    return
  }
  this.moduleDefs.forEach(function (defs) {
    delete defs[meta.index]
  })
  this.cachedModules.forEach(function (cache) {
    delete cache[meta.index]
  })
  delete this.moduleMeta[key]
}

State.prototype.initBundle = function (defs, cache) {
  if (this.moduleDefs.indexOf(defs) === -1) {
    this.moduleDefs.push(defs)
    this.cachedModules.push(cache)
  }
}

State.prototype.initModule = function (name, module) {
  this.runtimeModuleInfo[name].module = module
  module.hot = new Hot(name, this)
}

State.prototype.addRuntimeInfo = function (key) {
  if (!this.runtimeModuleInfo[key]) {
    var moduleMeta = this.moduleMeta
    this.runtimeModuleInfo[key] = {
      index: moduleMeta[key].index,
      hash: moduleMeta[key].hash,
      parents: new StrSet(moduleMeta[key].parents),
      module: null,
      disposeData: null,
      accepters: new StrSet(),
      accepting: new StrSet(),
      decliners: new StrSet(),
      declining: new StrSet(),
      selfAcceptCbs: [], // may contain null. nonzero length means module is self-accepting
      disposeHandlers: [],
    }
  }
  return this.runtimeModuleInfo[key]
}

State.prototype.toName =
State.prototype.getName = function (index) {
  var runtime = this.runtimeModuleInfo
  for (var key in this.runtimeModuleInfo) {
    if (has(runtime, key) && runtime[key].index === index) {
      return key
    }
  }
  return null
}

State.prototype.toIndex = function (key) {
  var meta = this.moduleMeta[key]
  return meta && meta.index
}

State.prototype.getModuleDef = function (index) {
  var moduleDefs = this.moduleDefs
  for (var i = moduleDefs.length - 1; i >= 0; i--) {
    if (has(moduleDefs[i], index)) {
      return moduleDefs[i][index]
    }
  }
  return null
}

State.prototype.getModuleDefFromName = function (key) {
  var meta = this.moduleMeta[key]
  if (meta && meta.index != null) {
    return this.getModuleDef(meta.index)
  }
  return null
}

State.prototype.getOutdatedModules = function () {
  var runtimeModuleInfo = this.runtimeModuleInfo
  var outdated = []
  var name
  // add changed and deleted modules
  for (name in runtimeModuleInfo) {
    if (has(runtimeModuleInfo, name)) {
      if (
        !has(localHmr.newLoad.moduleMeta, name) ||
        runtimeModuleInfo[name].hash !== localHmr.newLoad.moduleMeta[name].hash
      ) {
        outdated.push(name);
      }
    }
  }
  // add brand new modules
  for (name in localHmr.newLoad.moduleMeta) {
    if (has(localHmr.newLoad.moduleMeta, name)) {
      if (!has(runtimeModuleInfo, name)) {
        outdated.push(name);
      }
    }
  }
  // add modules that are non-accepting/declining parents of outdated modules.
  // important: if outdated has new elements added during the loop,
  // then we iterate over them too.
  for (var i=0; i<outdated.length; i++) {
    name = outdated[i];
    //jshint -W083
    if (has(runtimeModuleInfo, name)) {
      runtimeModuleInfo[name].parents.forEach(function(parentName) {
        if (
          runtimeModuleInfo[name].selfAcceptCbs.length === 0 &&
          !runtimeModuleInfo[name].accepters.has(parentName) &&
          !runtimeModuleInfo[name].decliners.has(parentName) &&
          outdated.indexOf(parentName) === -1
        ) {
          outdated.push(parentName);
        }
      });
    }
  }
  return outdated;
}

State.prototype.acceptNewModules = function (msg) {
  // Make sure we don't accept new modules before we've synced ourselves.
  if (!this.isAcceptingMessages) return
  if (this.isUpdating) {
    return this.queuedUpdateMessages.push(msg)
  }
  // Take the message and create a localHmr.newLoad value as if the
  // bundle had been re-executed, then call moduleHotApply.
  this.isUpdating = true

  this.update(msg.newModuleData, msg.removedModules)

  // random id so we can make the normally unnamed args have random names
  var rid = String(Math.random()).replace(/[^0-9]/g, '')
  forOwn(msg.newModuleData, function(value, key) {
    // this part needs to run after newModuleMeta and
    // newModuleIndexesToNames are populated.
    var newModuleFunction = (function() {
      var fn;
      //jshint evil:true
      if (bundle__filename || bundle__dirname) {
        fn = new Function('require', 'module', 'exports', '_u1'+rid, '_u2'+rid, '__u3'+rid, '__u4'+rid, '__filename', '__dirname', value.source);
        return function(require, module, exports, _u1, _u2, _u3, _u4) {
          global._hmr[bundleKey].initModule(key, module);
          fn.call(this, require, module, exports, _u1, _u2, _u3, _u4, bundle__filename, bundle__dirname);
        };
      } else {
        fn = new Function('require', 'module', 'exports',  '_u1'+rid, '_u2'+rid, '__u3'+rid, '__u4'+rid, value.source);
        return function(require, module, exports, _u1, _u2, _u3, _u4) {
          global._hmr[bundleKey].initModule(key, module);
          fn.call(this, require, module, exports, _u1, _u2, _u3, _u4);
        };
      }
    })();

    newModuleDefs[newModuleMeta[key].index] = [
      // module function
      newModuleFunction,
      // module deps
      mapValues(value.deps, function(depIndex, depRef) {
        var depName = newModuleIndexesToNames[depIndex];
        if (has(newModuleMeta, depName)) {
          return newModuleMeta[depName].index;
        } else {
          return depName;
        }
      })
    ];
  });
  localHmr.newLoad = {
    moduleDefs: newModuleDefs,
    moduleMeta: newModuleMeta,
    moduleIndexesToNames: newModuleIndexesToNames
  };
  localHmr.setStatus('ready');
  var outdatedModules = getOutdatedModules();
  moduleHotApply({ignoreUnaccepted: ignoreUnaccepted}, function(err, updatedNames) {
    if (err) {
      console.error('[HMR] Error applying update', err);
    }
    if (updatedNames) {
      console.log('[HMR] Updated modules', updatedNames);
      if (outdatedModules.length !== updatedNames.length) {
        var notUpdatedNames = filter(outdatedModules, function(name) {
          return updatedNames.indexOf(name) === -1;
        });
        console.log('[HMR] Some modules were not updated', notUpdatedNames);
      }
    }
    isUpdating = false;
    var queuedMsg;
    while ((queuedMsg = queuedUpdateMessages.shift())) {
      acceptNewModules(queuedMsg);
    }
  });
}

State.prototype.setStatus = function (status) {
  this.status = status
  var statusHandlers = this.statusHandlers.slice()
  for (var i = 0, len = statusHandlers.length; i < len; i++) {
    statusHandlers[i].call(null, status)
  }
}

State.prototype.apply = function (options, cb) {
  if (typeof options === 'function') {
    cb = options
    options = null
  }
  if (!cb) {
    throw new Error('module.hot.apply callback parameter required')
  }
  var ignoreUnaccepted = !!(options && options.ignoreUnaccepted)
  if (this.status !== 'ready') {
    return cb(new Error('module.hot.apply can only be called while status is ready'))
  }
  var runtimeModuleInfo = this.runtimeModuleInfo
  var outdatedModules = this.getOutdatedModules()
  var isValueNotInOutdatedModules = function(value) {
    return outdatedModules.indexOf(value) === -1
  }
  var acceptedUpdates = outdatedModules.filter(function(name) {
    if (!has(runtimeModuleInfo, name)) return true
    var runtimeInfo = runtimeModuleInfo[name]
    if (runtimeInfo.decliners.some(isValueNotInOutdatedModules)) return false
    if (runtimeInfo.accepters.size()) return true
    if (runtimeInfo.selfAcceptCbs.length) return true
    return !runtimeInfo.parents.some(isValueNotInOutdatedModules)
  })
  if (!ignoreUnaccepted && outdatedModules.length !== acceptedUpdates.length) {
    this.setStatus('idle')
    return cb(new Error('Some updates were declined'))
  }

  var an
  var i
  var len
  for (i =0, len = acceptedUpdates.length; i < len; i++) {
    an = acceptedUpdates[i]
    if (has(runtimeModuleInfo, an)) {
      var info = runtimeModuleInfo[an]
      info.disposeData = {}
      for (var j = 0; j < info.disposeHandlers.length; j++) {
        try {
          info.disposeHandlers[j].call(null, info.disposeData)
        } catch(e) {
          this.setStatus('idle')
          return cb(e || new Error('Unknown dispose callback error'))
        }
      }
    }
  }

  var selfAccepters = []
  var moduleMeta = this.moduleMeta
  var moduleDefs = this.moduleDefs
  for (i = 0, len = acceptedUpdates.length; i < len; i++) {
    an = acceptedUpdates[i]
    if (!has(runtimeModuleInfo, an)) {
      // new modules
      this.setRuntimeModuleInfo(an, moduleMeta[an])
    } else if (!has(moduleMeta, an)) {
      // removed modules
      delete this.cachedModules[runtimeModuleInfo[an].index]
      delete this.runtimeModuleInfo[an]
      continue
    } else {
      // updated modules
      runtimeModuleInfo[an].hash = moduleMeta[an].hash
      runtimeModuleInfo[an].parents = new StrSet(moduleMeta[an].parents)
      runtimeModuleInfo[an].module = null
      runtimeModuleInfo[an].accepting.forEach(function(accepted) {
        runtimeModuleInfo[accepted].accepters.del(an)
      });
      runtimeModuleInfo[an].accepting = new StrSet()
      runtimeModuleInfo[an].declining.forEach(function(accepted) {
        runtimeModuleInfo[accepted].decliners.del(an)
      });
      runtimeModuleInfo[an].declining = new StrSet()
      forEach(runtimeModuleInfo[an].selfAcceptCbs, function(cb) {
        selfAccepters.push({ name: an, cb: cb })
      });
      runtimeModuleInfo[an].selfAcceptCbs = []
      runtimeModuleInfo[an].disposeHandlers = []
    }

    moduleDefs[runtimeModuleInfo[an].index] = [
      // module function
      localHmr.newLoad.moduleDefs[localHmr.newLoad.moduleMeta[an].index][0],
      // module deps
      mapValues(localHmr.newLoad.moduleDefs[localHmr.newLoad.moduleMeta[an].index][1], function(depIndex, depRef) {
        var depName = localHmr.newLoad.moduleIndexesToNames[depIndex];
        if (has(localHmr.runtimeModuleInfo, depName)) {
          return localHmr.runtimeModuleInfo[depName].index;
        } else {
          return depName;
        }
      })
    ];
    cachedModules[runtimeModuleInfo[an].index] = null;
  }

  // Update the accept handlers list and call the right ones
  var errCanWait = null;
  var updatedNames = new StrSet(acceptedUpdates);
  var oldUpdateHandlers = localHmr.updateHandlers;
  var relevantUpdateHandlers = [];
  var newUpdateHandlers = [];
  for (i=0, len=oldUpdateHandlers.length; i<len; i++) {
    if (!updatedNames.has(oldUpdateHandlers[i].accepter)) {
      newUpdateHandlers.push(oldUpdateHandlers[i]);
    }
    if (updatedNames.hasIntersection(oldUpdateHandlers[i].deps)) {
      relevantUpdateHandlers.push(oldUpdateHandlers[i]);
    }
  }
  localHmr.updateHandlers = newUpdateHandlers;
  for (i=0, len=relevantUpdateHandlers.length; i<len; i++) {
    try {
      relevantUpdateHandlers[i].cb.call(null, acceptedUpdates);
    } catch(e) {
      if (errCanWait) emitError(errCanWait);
      errCanWait = e;
    }
  }

  // Call the self-accepting modules
  forEach(selfAccepters, function(obj) {
    try {
      require(runtimeModuleInfo[obj.name].index);
    } catch(e) {
      if (obj.cb) {
        obj.cb.call(null, e);
      } else {
        if (errCanWait) emitError(errCanWait);
        errCanWait = e;
      }
    }
  });

  localHmr.setStatus('idle');
  cb(errCanWait, acceptedUpdates);
}

module.exports = State
