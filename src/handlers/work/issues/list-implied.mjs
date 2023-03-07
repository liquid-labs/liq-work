import createError from 'http-errors'

import { determineCurrentBranch } from '@liquid-labs/git-toolkit'

import { doListIssues, getIssuesListEndpointParameters } from './_lib/list-lib'

const { help, method, parameters } = getIssuesListEndpointParameters({ workDesc : 'current' })

const path = ['work', 'issues', 'list']

const func = ({ app, cache, model, reporter }) => async(req, res) => {
  const currDir = req.get('X-CWD')
  if (currDir === undefined) {
    throw createError.BadRequest('Called \'work issues list\' with implied work, but \'X-CWD\' header not found.')
  }

  const workKey = await determineCurrentBranch({ projectPath : currDir, reporter })

  await doListIssues({ app, cache, reporter, req, res, workKey })
}

export { func, help, method, parameters, path }
