import createError from 'http-errors'

import { determineCurrentBranch } from '@liquid-labs/git-toolkit'

import { doClose, getCloseEndpointParameters } from './_lib/close-lib'

const { help, method, parameters } = getCloseEndpointParameters({ workDesc : 'implied', incluedAll : true })

const path = ['work', 'close']

const func = ({ app, cache, reporter }) => async(req, res) => {
  reporter = reporter.isolate()

  const cwd = req.get('X-CWD')
  if (cwd === undefined) { throw createError.BadRequest("Called 'work clean' with implied work, but 'X-CWD' header not found.") }

  const workKey = determineCurrentBranch({ projectPath : cwd, reporter })

  doClose({ app, cache, reporter, req, res, workKey })
}

export { func, help, parameters, path, method }
