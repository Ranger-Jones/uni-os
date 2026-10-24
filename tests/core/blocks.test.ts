import { expect, test } from 'vitest'
import { blocksToText } from '@core/domain/blocks'
import { para } from '../helpers/fixtures'

test('extracts text from nested blocks, links and styled runs', () => {
  const blocks = [
    { type: 'heading', props: { level: 1 }, content: [{ type: 'text', text: 'Kapitel 1', styles: { bold: true } }], children: [] },
    para('Ein ', [para('verschachtelt')]),
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Siehe ', styles: {} },
        { type: 'link', href: 'https://x', content: [{ type: 'text', text: 'Skript', styles: {} }] }
      ],
      children: []
    }
  ]
  expect(blocksToText(blocks)).toBe('Kapitel 1\nEin\nverschachtelt\nSiehe Skript')
})

test('extracts table cells in both BlockNote cell formats', () => {
  const table = {
    type: 'table',
    content: {
      type: 'tableContent',
      rows: [
        { cells: [[{ type: 'text', text: 'a', styles: {} }], { type: 'tableCell', content: [{ type: 'text', text: 'b', styles: {} }] }] }
      ]
    },
    children: []
  }
  expect(blocksToText([table])).toBe('a | b')
})

test('garbage input yields empty text instead of throwing', () => {
  expect(blocksToText(null)).toBe('')
  expect(blocksToText('nope')).toBe('')
  expect(blocksToText([{ type: 'image', props: { url: 'x' } }])).toBe('')
})

test('math block source is part of the plain text', () => {
  expect(blocksToText([{ type: 'math', props: { latex: 'e^{i\\pi}+1=0' }, children: [] }])).toBe('e^{i\\pi}+1=0')
})
