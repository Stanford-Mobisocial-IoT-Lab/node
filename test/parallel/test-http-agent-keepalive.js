'use strict';
const common = require('../common');
const assert = require('assert');
const http = require('http');
const Agent = require('_http_agent').Agent;

let name;

const agent = new Agent({
  keepAlive: true,
  keepAliveMsecs: 1000,
  maxSockets: 5,
  maxFreeSockets: 5
});

const server = http.createServer(common.mustCall((req, res) => {
  if (req.url === '/error') {
    res.destroy();
    return;
  } else if (req.url === '/remote_close') {
    // cache the socket, close it after a short delay
    const socket = res.connection;
    setImmediate(common.mustCall(() => socket.end()));
  }
  res.end('hello world');
}, 4));

function get(path, callback) {
  return http.get({
    host: 'localhost',
    port: server.address().port,
    agent: agent,
    path: path
  }, callback);
}

function checkDataAndSockets(body) {
  assert.strictEqual(body.toString(), 'hello world');
  assert.strictEqual(agent.sockets[name].length, 1);
  assert.strictEqual(agent.freeSockets[name], undefined);
}

function second() {
  // request second, use the same socket
  get('/second', common.mustCall((res) => {
    assert.strictEqual(res.statusCode, 200);
    res.on('data', checkDataAndSockets);
    res.on('end', common.mustCall(() => {
      assert.strictEqual(agent.sockets[name].length, 1);
      assert.strictEqual(agent.freeSockets[name], undefined);
      process.nextTick(common.mustCall(() => {
        assert.strictEqual(agent.sockets[name], undefined);
        assert.strictEqual(agent.freeSockets[name].length, 1);
        remoteClose();
      }));
    }));
  }));
}

function remoteClose() {
  // mock remote server close the socket
  get('/remote_close', common.mustCall((res) => {
    assert.deepStrictEqual(res.statusCode, 200);
    res.on('data', checkDataAndSockets);
    res.on('end', common.mustCall(() => {
      assert.strictEqual(agent.sockets[name].length, 1);
      assert.strictEqual(agent.freeSockets[name], undefined);
      process.nextTick(common.mustCall(() => {
        assert.strictEqual(agent.sockets[name], undefined);
        assert.strictEqual(agent.freeSockets[name].length, 1);
        // waitting remote server close the socket
        setTimeout(common.mustCall(() => {
          assert.strictEqual(agent.sockets[name], undefined);
          assert.strictEqual(agent.freeSockets[name], undefined,
                             'freeSockets is not empty');
          remoteError();
        }), common.platformTimeout(200));
      }));
    }));
  }));
}

function remoteError() {
  // remove server will destroy ths socket
  const req = get('/error', common.mustNotCall());
  req.on('error', common.mustCall((err) => {
    assert(err);
    assert.strictEqual(err.message, 'socket hang up');
    assert.strictEqual(agent.sockets[name].length, 1);
    assert.strictEqual(agent.freeSockets[name], undefined);
    // Wait socket 'close' event emit
    setTimeout(common.mustCall(() => {
      assert.strictEqual(agent.sockets[name], undefined);
      assert.strictEqual(agent.freeSockets[name], undefined);
      server.close();
    }), common.platformTimeout(1));
  }));
}

server.listen(0, common.mustCall(() => {
  name = `localhost:${server.address().port}:`;
  // request first, and keep alive
  get('/first', common.mustCall((res) => {
    assert.strictEqual(res.statusCode, 200);
    res.on('data', checkDataAndSockets);
    res.on('end', common.mustCall(() => {
      assert.strictEqual(agent.sockets[name].length, 1);
      assert.strictEqual(agent.freeSockets[name], undefined);
      process.nextTick(common.mustCall(() => {
        assert.strictEqual(agent.sockets[name], undefined);
        assert.strictEqual(agent.freeSockets[name].length, 1);
        second();
      }));
    }));
  }));
}));
