/*
 * THIS SOFTWARE IS PROVIDED ``AS IS'' AND ANY EXPRESSED OR IMPLIED
 * WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES
 * OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED.  IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY DIRECT,
 * INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
 * HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT,
 * STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING
 * IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 */

'use strict';

var async = require('async');
var dockerContainers = require('nscale-docker-analyzer');
var localDocker = require('./lib/local-docker');
var postProcessing = require('./lib/postProcessing');
var _ = require('lodash');


exports.initFilters = function(config, system) {
  var cnames = _.map(system.containerDefinitions, function(cdef) { return {name: cdef.name, type: cdef.type}; });
  cnames = _.filter(cnames, function(name) { return name.type === 'docker'; });

  config.dockerFilters = config.dockerFilters || [];

  if (system.name) {
    if (!_.find(config.dockerFilters, function(filter) { return filter === system.name; })) {
      config.dockerFilters.push(system.name);
    }
  }

  _.each(cnames, function(name) {
    if (!_.find(config.dockerFilters, function(filter) { return filter === name.name; })) {
      if (system.name && name.name.indexOf(system.name) !== 0) {
        config.dockerFilters.push(name.name);
      }
    }
  });
};



var findRootId = function(system) {
  var r = _.find(system.topology.containers, function(c) { return c.type === 'blank-container'; });
  return r ? r.id : '10';
};



/**
 * run an analysis on local system, either a Linux running Docker directly,
 * or a Linux/Mac system running Docker remotely (with DOCKER_HOST configured properly)
 *
 * config (required):
 *  * 'name':               the system name to use (optional)
 *  * 'namespace':          the system namespace to use (optional)
 *  * 'systemId':           the system id to insert into the generated system definition file (optional)
 *  * 'dockerFilters':      the tag key to filter images on (optional)
 *
 * system (required): the last known system state, can be null
 *
 * cb: the callback that will be called with the result.
 */
exports.analyze = function analyze(config, system, cb) {
  system = system || {};

  var docker = dockerContainers(localDocker);
  var rootId = findRootId(system);
  var result = {
    'name': system.name || config.name,
    'namespace': system.namespace || config.namespace,
    'id': system.systemId || config.systemId,
    'containerDefinitions': [{
      'name': 'Machine',
      'type': 'blank-container',
      'specific': {},
      'id': '85d99b2c-06d0-5485-9501-4d4ed429799c'
    }],
    'topology': {
      'containers': {},
    }
  };
  result.topology.containers[rootId] = {'id': rootId,
                                        'containerDefinitionId': '85d99b2c-06d0-5485-9501-4d4ed429799c',
                                        'containedBy': rootId,
                                        'contains': [],
                                        'type': 'blank-container',
                                        'specific': {'ipaddress': 'localhost'}};
  exports.initFilters(config, system);

  async.eachSeries([
    docker.fetchImages,
    docker.fetchContainers,
    postProcessing
  ], function(func, cb) {
    func(config, result, function(err) {
      if (err) { return cb(err); }
      cb(null);
    });
  }, function(err) {
    if (err) {
      return cb(err);
    }
    cb(null, result);
  });
};


