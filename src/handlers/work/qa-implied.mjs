import createError from 'http-errors'

import { determineCurrentBranch } from '@liquid-labs/git-toolkit'

import { getCommonImpliedParameters } from './_lib/common-implied-parameters'
import { getQAEndpointParams, doQA } from './_lib/qa-lib'

let { help, method, parameters } = getQAEndpointParams({ workDesc : 'implied' })
parameters = [
  ...getCommonImpliedParameters({ actionDesc : 'qa' }),
  ...parameters
].sort((a, b) => a.name.localeCompare(b.name))

const path = ['work', 'qa']

const func = ({ app, cache, model, reporter }) => async(req, res) => {
  reporter = reporter.isolate()

  const cwd = req.get('X-CWD')
  if (cwd === undefined) { throw createError.BadRequest("Called 'work qa' with implied work, but 'X-CWD' header not found.") }

  const workKey = determineCurrentBranch({ projectPath : cwd, reporter })

  await doQA({ app, cache, model, reporter, req, res, workKey })
}

export { func, help, parameters, path, method }
