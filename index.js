'use strict';

var async = require('async');
var inherits = require('util').inherits;
var EventEmitter = require('events').EventEmitter;

var ST = {
    CLOSED:    0,
    CONNECTED: 1,
    LOADING:   2,
    READY:     3
};

function Lured(redisClient, scripts) {
    if (!redisClient || typeof redisClient !== 'object') {
        throw new Error('Invalid redis client');
    }
    if (!scripts || typeof scripts !== 'object') {
        throw new Error('Invalid scripts');
    }
    this._client = redisClient;
    this._scripts = scripts;

    // Define getter 'scripts'
    var self = this;
    this.__defineGetter__("scripts", function() {
        return self._scripts;
    });
    // Define getter 'state'
    var self = this;
    this.__defineGetter__("state", function() {
        return self._state;
    });

    // Initial state
    this._state = ST.CLOSED;
    if (redisClient.connected) {
        this._state = ST.CONNECTED;
    }

    redisClient.on('connect', function () {
        var ps = self._state;
        self._state = ST.CONNECTED;
        if (ps !== self._state) {
            self.emit('state', ps, self._state);
        }
        self.load({force:true}, function () {});
    });

    redisClient.on('end', function (err) {
        var ps = self._state;
        self._state = ST.CLOSED;
        if (ps !== self._state) {
            self.emit('state', ps, self._state);
        }
    });

    redisClient.on('error', function (err) {
        // to avoid exit on error.
    });
}

inherits(Lured, EventEmitter);

Lured.prototype.load = function load(options, cb) {
    var self = this;
    var tasks = [];
    var lastErr;

    if (typeof options !== 'object') {
        cb = options;
        options = {};
    }

    Object.keys(this._scripts).forEach(function (k) {
        var v = self._scripts[k];
        if (!v.script || typeof v.script !== 'string') {
            lastErr = new Error('Invalid script for ' + k);
            return;
        }
        tasks.push(function(next) {
            if (options.force) {
                self._load(v.script, function (err, newSha) {
                    if (err) { lastErr = err; }
                    v.sha = newSha;
                    next();
                });
                return;
            }

            if (!v.sha || typeof v.sha !== 'string') {
                v.sha = require('crypto').createHash("sha1").update(v.script).digest("hex");
            }

            self._exists(v.sha, function (err, exist) {
                if (exist) {
                    return void(next());
                }
                self._load(v.script, function (err, newSha) {
                    if (err) { lastErr = err; }
                    v.sha = newSha;
                    next();
                });
            });
        });
    });
    async.series(tasks, function () {
        var ps = self._state;
        if (lastErr) {
            if (self._client.connected) {
                self._state = ST.CONNECTED;
            } else {
                self._state = ST.CLOSED;
            }
        } else {
            self._state = ST.READY;
        }
        if (ps !== self._state) {
            self.emit('state', ps, self._state);
        }
        cb(lastErr);
    });
    var ps = this._state;
    this._state = ST.LOADING;
    if (ps !== this._state) {
        this.emit('state', ps, this._state);
    }
};

Lured.prototype._exists = function _exists(sha, cb) {
    this._client.multi([['script', 'exists', sha]])
    .exec(function (err, replies) {
        if (err) {
            return void(cb(err));
        }
        return void(cb(null, (replies[0][0] === 1)?true:false));
    });
};

Lured.prototype._load = function _load(script, cb) {
    this._client.multi([['script', 'load', script]])
    .exec(function (err, replies) {
        if (err) {
            return void(cb(err));
        }
        var sha = replies[0];
        if (sha.indexOf('ERR') >= 0) {
            return void(cb(new Error(sha)));
        }
        cb(null, sha);
    });
};


exports.create = function(redisClient, scripts) {
    return new Lured(redisClient, scripts);
};
