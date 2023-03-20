import createError from 'http-errors'

import { determineCurrentBranch } from '@liquid-labs/git-toolkit'

import { doStatus, getStatusEndpointParameters } from './_lib/status-lib'

const { help, method, parameters } = getStatusEndpointParameters({ workDesc : 'implied' })

const path = ['work', 'status']

const func = ({ app, cache, reporter }) => async(req, res) => {
  reporter = reporter.isolate()

  const cwd = req.get('X-CWD')
  if (cwd === undefined) { throw createError.BadRequest("Called 'work submit' with implied work, but 'X-CWD' header not found.") }

  const workKey = determineCurrentBranch({ projectPath : cwd, reporter })

  doStatus({ app, cache, reporter, req, res, workKey })
}

export { func, help, parameters, path, method }
