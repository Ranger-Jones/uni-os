import { z } from 'zod'

export class AppError extends Error {
  constructor(
    public code: 'NOT_FOUND' | 'VALIDATION' | 'CONFLICT' | 'INTERNAL',
    message: string
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export const notFound = (what: string): AppError => new AppError('NOT_FOUND', `${what} not found`)

/** Parse with zod and convert failures into a readable VALIDATION error. */
export function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const r = schema.safeParse(input)
  if (!r.success) {
    const msg = r.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ')
    throw new AppError('VALIDATION', msg)
  }
  return r.data
}
