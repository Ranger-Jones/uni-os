import { expect, test } from 'vitest'
import { decryptBytes, decryptJson, deriveKey, encryptBytes, encryptJson, makeCheck, newSalt, verifyCheck } from '@core/sync/crypto'
import { mergeDocuments } from '@core/sync/merge'

test('encryption round-trips JSON and bytes; ciphertexts differ every time', () => {
  const key = deriveKey('correct horse battery', newSalt())
  const row = { id: 'p1', title: 'Gimbal lock', content: '[{"id":"b1"}]' }
  const a = encryptJson(key, row)
  const b = encryptJson(key, row)
  expect(a).not.toBe(b)
  expect(a).not.toContain('Gimbal')
  expect(decryptJson(key, a)).toEqual(row)
  const data = new Uint8Array([1, 2, 3, 250])
  expect(decryptBytes(key, encryptBytes(key, data))).toEqual(data)
}, 30_000)

test('a wrong password cannot read the data, and the check value tells it apart', () => {
  const salt = newSalt()
  const right = deriveKey('pw-one', salt)
  const wrong = deriveKey('pw-two', salt)
  const check = makeCheck(right)
  expect(verifyCheck(right, check)).toBe(true)
  expect(verifyCheck(wrong, check)).toBe(false)
  expect(() => decryptJson(wrong, encryptJson(right, { a: 1 }))).toThrow()
  // same password + salt gives the same key on another device
  expect(verifyCheck(deriveKey('pw-one', salt), check)).toBe(true)
}, 30_000)

const b = (id: string, text: string) => ({ id, type: 'paragraph', content: [{ type: 'text', text }] })

test('merge: edits of different blocks on both devices are both kept', () => {
  const base = [b('1', 'one'), b('2', 'two'), b('3', 'three')]
  const local = [b('1', 'ONE (local)'), b('2', 'two'), b('3', 'three')]
  const remote = [b('1', 'one'), b('2', 'two'), b('3', 'THREE (remote)')]
  expect(mergeDocuments(base, local, remote, { localIsNewer: true })).toEqual([b('1', 'ONE (local)'), b('2', 'two'), b('3', 'THREE (remote)')])
})

test('merge: the same block changed on both sides → the newer side wins', () => {
  const base = [b('1', 'one')]
  const local = [b('1', 'local')]
  const remote = [b('1', 'remote')]
  expect(mergeDocuments(base, local, remote, { localIsNewer: true })).toEqual([b('1', 'local')])
  expect(mergeDocuments(base, local, remote, { localIsNewer: false })).toEqual([b('1', 'remote')])
})

test('merge: blocks added on either side are kept in place; deletes win only over unchanged blocks', () => {
  const base = [b('1', 'one'), b('2', 'two'), b('3', 'three')]
  const local = [b('1', 'one'), b('L', 'added locally'), b('2', 'two'), b('3', 'three')]
  // remote deleted block 2 (unchanged locally) and block 3 (but local did not change it either), added R after 1
  const remote = [b('1', 'one'), b('R', 'added remotely')]
  expect(mergeDocuments(base, local, remote, { localIsNewer: false }).map((x) => x.id)).toEqual(['1', 'L', 'R'])
  // a block deleted remotely but edited locally survives
  const edited = [b('1', 'one'), b('2', 'two EDITED'), b('3', 'three')]
  expect(mergeDocuments(base, edited, remote, { localIsNewer: false }).map((x) => x.id)).toEqual(['1', '2', 'R'])
})

test('merge without a common base keeps everything from both sides', () => {
  expect(mergeDocuments(null, [b('1', 'a')], [b('2', 'b')], { localIsNewer: true }).map((x) => x.id)).toEqual(['1', '2'])
})
