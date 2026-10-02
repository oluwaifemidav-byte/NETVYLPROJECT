import { spawnSync } from 'node:child_process'
const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const r = spawnSync(cmd,['next','build'],{stdio:'inherit',env:{...process.env,NETVYL_MOBILE_BUILD:'1'}})
process.exit(r.status ?? 1)
