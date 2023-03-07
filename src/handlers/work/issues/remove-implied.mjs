import createError from 'http-errors'

import { determineCurrentBranch } from '@liquid-labs/git-toolkit'

import { doRemoveIssues, getIssuesRemoveEndpointParameters } from './_lib/remove-lib'

const { help, method, parameters } = getIssuesRemoveEndpointParameters({ workDesc : 'current' })

const path = ['work', 'issues', 'remove']

const func = ({ app, cache, model, reporter }) => async(req, res) => {
  const currDir = req.get('X-CWD')
  if (currDir === undefined) {
    throw createError.BadRequest('Called \'work issues list\' with implied work, but \'X-CWD\' header not found.')
  }

  const workKey = await determineCurrentBranch({ projectPath : currDir, reporter })

  await doRemoveIssues({ app, cache, reporter, req, res, workKey })
}

export { func, help, method, parameters, path }
