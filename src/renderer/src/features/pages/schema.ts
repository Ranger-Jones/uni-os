import { BlockNoteSchema, createCodeBlockSpec, defaultBlockSpecs } from '@blocknote/core'
import { MathBlock } from './MathBlock'

export const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    math: MathBlock(),
    codeBlock: createCodeBlockSpec({
      defaultLanguage: 'text',
      supportedLanguages: {
        text: { name: 'Plain text' },
        python: { name: 'Python', aliases: ['py'] },
        java: { name: 'Java' },
        javascript: { name: 'JavaScript', aliases: ['js'] },
        typescript: { name: 'TypeScript', aliases: ['ts'] },
        c: { name: 'C' },
        cpp: { name: 'C++' },
        csharp: { name: 'C#', aliases: ['cs'] },
        sql: { name: 'SQL' },
        bash: { name: 'Shell', aliases: ['sh', 'zsh'] },
        r: { name: 'R' },
        matlab: { name: 'MATLAB' },
        haskell: { name: 'Haskell' },
        json: { name: 'JSON' },
        latex: { name: 'LaTeX source', aliases: ['tex'] }
      }
    })
  }
})
