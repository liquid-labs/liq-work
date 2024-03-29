import createError from 'http-errors'

import { determineCurrentBranch } from '@liquid-labs/git-toolkit'

import { doClean, getCleanEndpointParameters } from './_lib/clean-lib'

const { help, method, parameters } = getCleanEndpointParameters({ workDesc : 'implied', incluedAll : true })

const path = ['work', 'clean']

const func = ({ app, cache, reporter }) => async(req, res) => {
  reporter = reporter.isolate()

  const cwd = req.get('X-CWD')
  if (cwd === undefined) { throw createError.BadRequest("Called 'work clean' with implied work, but 'X-CWD' header not found.") }

  const workKey = determineCurrentBranch({ projectPath : cwd, reporter })

  doClean({ app, cache, reporter, req, res, workKey })
}

export { func, help, parameters, path, method }
