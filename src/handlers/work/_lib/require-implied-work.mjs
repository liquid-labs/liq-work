import createError from 'http-errors'

import { determineCurrentBranch } from '@liquid-labs/git-toolkit'

const requireImpliedBranch = async({ req, reporter }) => {
  const currDir = req.get('X-CWD')
  if (currDir === undefined) {
    throw createError.BadRequest('Called \'work issues list\' with implied work, but \'X-CWD\' header not found.')
  }

  return await determineCurrentBranch({ projectPath : currDir, reporter })
}

export { requireImpliedBranch }
