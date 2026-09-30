// Usage: node tools/legacy-tests/run.js
const fs = require('fs');
const path = require('path');
const {run} = require('./harness.cjs');

fs.readdirSync(__dirname).filter(f => f.endsWith('.test.cjs')).sort().forEach(f => require(path.join(__dirname, f)));
run();
