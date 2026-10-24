// Signs dist/SHA256SUMS.txt with the offline Ed25519 release key → dist/SHA256SUMS.txt.sig (base64).
const crypto = require('node:crypto')
const fs = require('node:fs')
const key = crypto.createPrivateKey(fs.readFileSync(process.argv[2]))
const data = fs.readFileSync('dist/SHA256SUMS.txt')
fs.writeFileSync('dist/SHA256SUMS.txt.sig', crypto.sign(null, data, key).toString('base64'))
