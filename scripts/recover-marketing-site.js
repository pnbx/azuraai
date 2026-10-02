// Recovers the source tree of a Vercel deployment.
//
// The marketing site at www.azuraai.ir predates this repo's git snapshot, so
// the only surviving copy is the deployment itself. Vercel exposes the exact
// uploaded file tree (v13) and per-file contents (v8, base64), which means the
// site can be reconstructed byte-for-byte and moved to its own project.
//
// Usage: node scripts/recover-marketing-site.js <deploymentId> <outDir>

const fs = require('fs')
const path = require('path')

const TOKEN = JSON.parse(
  fs.readFileSync(
    process.env.HOME + '/AppData/Roaming/com.vercel.cli/Data/auth.json',
    'utf8'
  )
).token

const DEPLOYMENT = process.argv[2]
const OUT = process.argv[3]

if (!DEPLOYMENT || !OUT) {
  console.error('usage: node recover-marketing-site.js <deploymentId> <outDir>')
  process.exit(1)
}

/** Files that are build output or local tooling noise, not source. */
const SKIP = new Set(['tsconfig.tsbuildinfo', '.freebuff-dev.log'])
const SKIP_PREFIX = ['node_modules/', '.next/', '.freebuff/', 'supabase/.temp/']

async function api(pathname) {
  const res = await fetch(`https://api.vercel.com/${pathname}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  })
  if (!res.ok) throw new Error(`${pathname} -> ${res.status}`)
  return res.json()
}

/** Flattens the nested directory listing into { path, uid } entries. */
function flatten(nodes, prefix = '', out = []) {
  for (const node of nodes) {
    const full = prefix ? `${prefix}/${node.name}` : node.name
    if (node.type === 'directory' && node.children) flatten(node.children, full, out)
    else if (node.type === 'file') out.push({ path: full, uid: node.uid })
  }
  return out
}

async function main() {
  console.log(`listing files for ${DEPLOYMENT} …`)
  const tree = await api(`v13/deployments/${DEPLOYMENT}/files?limit=1000`)
  const all = flatten(Array.isArray(tree) ? tree : tree.files)

  // Everything is nested under src/ in that upload; strip it so the recovered
  // tree looks like a normal project root.
  const files = all.filter((f) => {
    const rel = f.path.replace(/^src\//, '')
    if (!rel) return false
    if (SKIP.has(path.basename(rel))) return false
    if (SKIP_PREFIX.some((p) => f.path.startsWith(p) || rel.startsWith(p))) return false
    return true
  })

  console.log(`downloading ${files.length} files …`)

  let ok = 0
  const failed = []
  // Small concurrency: enough to be quick, gentle on the API.
  const queue = [...files]
  const workers = Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const file = queue.shift()
      try {
        const res = await api(`v8/deployments/${DEPLOYMENT}/files/${file.uid}`)
        const buf = Buffer.from(res.data, 'base64')
        const dest = path.join(OUT, file.path.replace(/^src\//, ''))
        fs.mkdirSync(path.dirname(dest), { recursive: true })
        fs.writeFileSync(dest, buf)
        ok++
      } catch (err) {
        failed.push(`${file.path}: ${err.message}`)
      }
    }
  })
  await Promise.all(workers)

  console.log(`\ndownloaded ${ok}/${files.length}`)
  if (failed.length) {
    console.log('failures:')
    failed.forEach((f) => console.log('  ' + f))
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})