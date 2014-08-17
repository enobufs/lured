# lured
[![NPM](https://nodei.co/npm/lured.png?compact=true)](https://nodei.co/npm/lured/)

[![unstable](https://img.shields.io/badge/stability-unstable-yellowgreen.svg)](http://nodejs.org/api/documentation.html#documentation_stability_index)
[![Build Status](https://travis-ci.org/enobufs/lured.svg?branch=master)](https://travis-ci.org/enobufs/lured)
Lua script loader for Redis.

## Installation
    $ npm install lured

## Features
* Makes easier for cumbersom script loading and management
* Supports multiple scripts
* Simple, intuitive and non-intrusive.
* SHA values are available to user. User still has a full control.  (See [Usage] section)
* Automatically reload scripts after a reconnection. (assuming script cache may be wiped out)
* When loading, it will try SCRIPT EXISTS before performing SCRIPT LOAD to reduce network resource usage.

## API

### Module method
* create(redisClient, scripts) -
Creates an instance of lured. The `scripts` is an object in with the following structure:

```js
var scripts = {
    foo: {
        script: "return 1", // your lua script for 'foo'
        sha: "e0e1f9fabfc9d4800c877a703b823ac0578ff8db" // filled by lured
    },    bar: {
        script: "return 2", // your lua script for 'bar'
        sha: "7f923f79fe76194c868d7e1d0820de36700eb649" // filled by lured
    }	};
```
Where, `sha` properties are automatically filled by lured.

### Instance method
* lured.load(cb) -
Load given scripts, then set shas to the scripts object.
* lured.scripts (getter) -
Returns the scripts object. (just for convenience)
* Event: 'state' - Emits (using EventEmitter) state change. Possible states are; 0:CLOSED, 1:CONNECTED, 2:LOADING and 3:READY. Registered handler will have two arguments: from-state and to-state.

## Usage

```js
var fs = require('fs')
var scripts = {
    foo: {
        script: fs.readFileSync(__dirname + '/foo.lua', {encoding:'utf8'})
    },    bar: {
        script: fs.readFileSync(__dirname + '/bar.lua', {encoding:'utf8'})
    }	};
var client = require('redis').createClient();
var lured = require('lured').create(client, scripts);

// Load all scripts on to redis server.
lured.load(function (err) {
	if (err) { /* handler error */}
	else {
		// Do your cool stuff here
		// Now you can safely do something like this:
		client.multi()
             .evalsha(scripts.foo.sha, 0)	             .evalsha(scripts.bar.sha, 0)
             .exec(function(err, replies) {
                 // Check your replies.             });		}
});

```
## Notes
### Auto Reload
When redis client emits 'connect' event, lured will check if the scripts are still cached, if not it will reload the scripts for you. If you need to track down the underlying behavior, set a listener on 'state' event.

### Why lured while there are other similar script loaders?
Script loading and management is pain. So, looked for a good tool. I wanted to use SHA values so that I can use MULTI with mixture of the scripts and other commands, but the tools I came across hide many good stuff including the SHA values, and here comes the `lured`!