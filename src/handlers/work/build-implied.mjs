import createError from 'http-errors'

import { determineCurrentBranch } from '@liquid-labs/git-toolkit'

import { getCommonImpliedParameters } from './_lib/common-implied-parameters'
import { getBuildEndpointParams, doBuild } from './_lib/build-lib'

let { help, method, parameters } = getBuildEndpointParams({ workDesc : 'implied' })
parameters = [
  ...getCommonImpliedParameters({ actionDesc : 'build' }),
  ...parameters
].sort((a, b) => a.name.localeCompare(b.name))

const path = ['work', 'build']

const func = ({ app, cache, reporter }) => async(req, res) => {
  reporter = reporter.isolate()

  const cwd = req.get('X-CWD')
  if (cwd === undefined) { throw createError.BadRequest("Called 'work build' with implied work, but 'X-CWD' header not found.") }

  const workKey = determineCurrentBranch({ projectPath : cwd, reporter })

  await doBuild({ app, cache, reporter, req, res, workKey })
}

export { func, help, parameters, path, method }
