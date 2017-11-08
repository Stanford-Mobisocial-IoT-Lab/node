'use strict';
const common = require('../common');
if (!common.hasCrypto)
  common.skip('missing crypto');

const assert = require('assert');
const tls = require('tls');
const fs = require('fs');

const dir = common.fixturesDir;
const options = { key: fs.readFileSync(`${dir}/test_key.pem`),
                  cert: fs.readFileSync(`${dir}/test_cert.pem`),
                  ca: [ fs.readFileSync(`${dir}/test_ca.pem`) ] };

const server = tls.createServer(options, onconnection);
let gotChunk = false;
let gotDrain = false;

function onconnection(conn) {
  conn.on('data', function(c) {
    if (!gotChunk) {
      gotChunk = true;
      console.log('ok - got chunk');
    }

    // just some basic sanity checks.
    assert(c.length);
    assert(Buffer.isBuffer(c));

    if (gotDrain)
      process.exit(0);
  });
}

server.listen(0, function() {
  const chunk = Buffer.alloc(1024, 'x');
  const opt = { port: this.address().port, rejectUnauthorized: false };
  const conn = tls.connect(opt, function() {
    conn.on('drain', ondrain);
    write();
  });
  function ondrain() {
    if (!gotDrain) {
      gotDrain = true;
      console.log('ok - got drain');
    }
    if (gotChunk)
      process.exit(0);
    write();
  }
  function write() {
    // this needs to return false eventually
    while (false !== conn.write(chunk));
  }
});
