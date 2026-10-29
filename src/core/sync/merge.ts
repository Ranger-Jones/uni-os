// Three-way merge of note pages (BlockNote documents) by top-level block id.

type Block = { id?: unknown }
const idOf = (b: unknown): string | null => (b && typeof b === 'object' && typeof (b as Block).id === 'string' ? ((b as Block).id as string) : null)
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/**
 * A block changed on one side wins over the unchanged other side; changed on both sides → the newer row's version.
 * Blocks added on either side are kept; a delete wins only over a block the other side did not change.
 * Without a common base (first sync of a page that exists on both devices) everything from both sides is kept.
 */
export function mergeDocuments<T>(base: T[] | null, local: T[], remote: T[], opts: { localIsNewer: boolean }): T[] {
  const index = (list: T[] | null) => new Map((list ?? []).flatMap((b) => (idOf(b) ? [[idOf(b)!, b] as const] : [])))
  const B = index(base)
  const L = index(local)
  const R = index(remote)
  const chosen = new Map<string, T>()
  for (const id of new Set([...L.keys(), ...R.keys()])) {
    const l = L.get(id)
    const r = R.get(id)
    const b = B.get(id)
    const lChanged = l !== undefined && (b === undefined || !same(l, b))
    const rChanged = r !== undefined && (b === undefined || !same(r, b))
    if (l !== undefined && r !== undefined) chosen.set(id, lChanged && rChanged ? (opts.localIsNewer ? l : r) : lChanged ? l : r)
    else if (l !== undefined) {
      if (base === null || !B.has(id) || lChanged) chosen.set(id, l) // added locally, or edited locally while deleted remotely
    } else if (r !== undefined) {
      if (base === null || !B.has(id) || rChanged) chosen.set(id, r)
    }
  }
  // Local order first; blocks only the remote has go after their remote predecessor (skipping blocks the remote lacks).
  const order = local.map(idOf).filter((id): id is string => !!id && chosen.has(id))
  const remoteIds = remote.map(idOf).filter((id): id is string => !!id)
  remoteIds.forEach((id, i) => {
    if (!chosen.has(id) || order.includes(id)) return
    let at = 0
    for (let j = i - 1; j >= 0; j--) {
      const k = order.indexOf(remoteIds[j])
      if (k >= 0) {
        at = k + 1
        break
      }
    }
    while (at < order.length && !R.has(order[at])) at++
    order.splice(at, 0, id)
  })
  const withoutId = local.filter((b) => !idOf(b))
  return [...order.map((id) => chosen.get(id)!), ...withoutId]
}
