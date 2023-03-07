import createError from 'http-errors'

import { determineCurrentBranch } from '@liquid-labs/git-toolkit'

import { doAddIssues, getIssuesAddEndpointParameters } from './_lib/add-lib'

const { help, method, parameters } = getIssuesAddEndpointParameters({ workDesc : 'current' })

const path = ['work', 'issues', 'add']

const func = ({ app, cache, model, reporter }) => async(req, res) => {
  const currDir = req.get('X-CWD')
  if (currDir === undefined) {
    throw createError.BadRequest('Called \'work issues add\' with implied work, but \'X-CWD\' header not found.')
  }

  const workKey = await determineCurrentBranch({ projectPath : currDir, reporter })

  await doAddIssues({ app, cache, reporter, req, res, workKey })
}

export { func, help, method, parameters, path }
