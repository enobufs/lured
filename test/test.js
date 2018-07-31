'use strict';

var redis = require('redis');
var sinon = require('sinon');
var assert = require('assert');

describe('lured test', function () {
    var c;
    var lured;
    var scripts = {
        hello: {
            script: "return 'hello'",
            exp: '1b936e3fe509bcbc9cd0664897bbe8fd0cac101b'
        },
        bye: {
            script: "return 'bye'",
            exp: '529e915cc3c034336e2d659818a4436b5e51cc2d'
        }
    };
    var sandbox;
    var spyExists;
    var spyLoad;

    before(function (done) {
        c = redis.createClient();

        function setup(cb) {
            lured = require('..').create(c, scripts);
            sandbox = sinon.createSandbox();
            c.multi([['script', 'flush']]).exec(cb);
        }

        if (!c.connected) {
            c.once('connect', function() {
                setup(done);
            });
        } else {
            setup(done);
        }
    });

    beforeEach(function () {
        spyExists = sandbox.spy(lured, '_exists');
        spyLoad = sandbox.spy(lured, '_load');
    });

    afterEach(function () {
        sandbox.restore();
    });

    it('Establish sha', function (done) {
        lured.load(function (err) {
            assert.ifError(err);
            assert.strictEqual(scripts.hello.sha, scripts.hello.exp);
            assert.strictEqual(scripts.bye.sha, scripts.bye.exp);
            assert(spyExists.calledTwice);
            assert(spyLoad.calledTwice);
            done();
        });
    });

    it('multi with scripts', function (done) {
        c.multi()
        .evalsha(scripts.hello.sha, 0)
        .evalsha(scripts.bye.sha, 0)
        .exec(function(err, results) {
            assert.strictEqual(results[0], 'hello');
            assert.strictEqual(results[1], 'bye');
            done();
        });
    });

    it('Should not load scripts again', function (done) {
        lured.load(function (err) {
            assert.ifError(err);
            assert.strictEqual(scripts.hello.sha, scripts.hello.exp);
            assert.strictEqual(scripts.bye.sha, scripts.bye.exp);
            assert(spyExists.calledTwice);
            assert(!spyLoad.called);
            done();
        });
    });

    it('success with sha after flush', function (done) {
        c.multi([['script', 'flush']]).exec(function () {
            lured.load(function (err) {
                assert.ifError(err);
                assert.strictEqual(scripts.hello.sha, scripts.hello.exp);
                assert.strictEqual(scripts.bye.sha, scripts.bye.exp);
                assert(spyExists.calledTwice);
                assert(spyLoad.calledTwice);
                done();
            });
        });
    });

    it('load with force flag true', function (done) {
        lured.load({ force:true }, function (err) {
            assert.ifError(err);
            assert.strictEqual(scripts.hello.sha, scripts.hello.exp);
            assert.strictEqual(scripts.bye.sha, scripts.bye.exp);
            assert(!spyExists.called);
            assert(spyLoad.calledTwice);
            done();
        });
    });
});

describe('lured error tests', function () {
    var c;
    var lured;
    var sandbox;
    var spyExists;
    var spyLoad;

    before(function () {
        sandbox = sinon.createSandbox();
    });

    beforeEach(function (done) {
        c = redis.createClient();
        c.multi([['script', 'flush']]).exec(done);
    });

    afterEach(function (done) {
        if (lured) {
            lured.removeAllListeners();
            lured = null;
        }
        sandbox.restore();
        c.quit(function () {
            c = null;
            done();
        });
    });

    it('throws when null scripts', function () {
        assert.throws(
            function () {
                lured = require('..').create(c, null);
            },
            function(err) {
                if (err instanceof Error) {
                    return true;
                }
            },
            "unexpected error"
        );
    });

    it('throws when non-object scripts', function () {
        assert.throws(
            function () {
                lured = require('..').create(c, 'bad');
            },
            function(err) {
                if (err instanceof Error) {
                    return true;
                }
            },
            "unexpected error"
        );
    });

    it('throws when null client', function () {
        assert.throws(
            function () {
                lured = require('..').create(null, {});
            },
            function(err) {
                if (err instanceof Error) {
                    return true;
                }
            },
            "unexpected error"
        );
    });

    it('throws when non-object client', function () {
        assert.throws(
            function () {
                lured = require('..').create('badObj', {});
            },
            function(err) {
                if (err instanceof Error) {
                    return true;
                }
            },
            "unexpected error"
        );
    });

    it('Should detect invalid null', function (done) {
        lured = require('..').create(c, {
            hello: {
                script: "return 'hello'"
            },
            bye: {
                script: null
            }
        })
        spyExists = sandbox.spy(lured, '_exists');
        spyLoad = sandbox.spy(lured, '_load');
        lured.load(function (err) {
            assert(err);
            assert(spyExists.calledOnce);
            assert(spyLoad.calledOnce);
            done();
        });
    });

    it('Should detect invalid script', function (done) {
        var scripts = {
            hello: {
                script: "return 'hello'"
            },
            bye: {
                script: "INVALID LUA"
            }
        };
        lured = require('..').create(c, scripts)
        spyExists = sandbox.spy(lured, '_exists');
        spyLoad = sandbox.spy(lured, '_load');
        lured.load(function (err) {
            var _e;
            try {
                assert(err);
                assert(spyExists.calledTwice);
                assert(spyLoad.calledTwice);
                assert.equal(typeof scripts.hello.sha, 'string');
                assert.strictEqual(scripts.bye.sha, void(0));
            } catch (e) {
                _e = e;
            }
            done(_e);
        });
    });

    it('Should auto-reload after disconnect', function (done) {
        // Build shas then disconnect
        lured = require('..').create(c, {
            hello: {
                script: "return 'hello'"
            },
            bye: {
                script: "return 'bye'"
            }
        })
        lured.load(function (err) {
            var onceDisconn = false;
            var onceConn = false;
            var onceLoading = false;
            assert.ifError(err);
            c.stream.destroy();
            lured.on('state', function (from, to) {
                switch (to) {
                case 0:
                    onceDisconn = true;
                    break;
                case 1:
                    onceConn = true;
                    break;
                case 2:
                    onceLoading = true;
                    break;
                case 3:
                    if (onceDisconn && onceConn && onceLoading) {
                        done();
                    } else {
                        done(new Error('Unexpected state transition'));
                    }
                    break;
                }
            });
        });
    });
});

