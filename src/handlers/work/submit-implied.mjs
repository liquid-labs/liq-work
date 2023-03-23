import createError from 'http-errors'

import { determineCurrentBranch } from '@liquid-labs/git-toolkit'

import { getCommonImpliedParameters } from './_lib/common-implied-parameters'
import { getSubmitEndpointParams, doSubmit } from './_lib/submit-lib'

let { help, method, parameters } = getSubmitEndpointParams({ descIntro : 'Submits the changes associated with the current unit of work by creating a pull request for the changes in each project associated with the unit of work.' })
parameters = [
  ...getCommonImpliedParameters({ actionDesc : 'submit' }),
  ...parameters
].sort((a, b) => a.name.localeCompare(b.name))

const path = ['work', 'submit']

const func = ({ app, cache, model, reporter }) => async(req, res) => {
  reporter = reporter.isolate()

  const cwd = req.get('X-CWD')
  if (cwd === undefined) { throw createError.BadRequest("Called 'work submit' with implied work, but 'X-CWD' header not found.") }

  const workKey = determineCurrentBranch({ projectPath : cwd, reporter })

  const { all, projects } = req.vars

  await doSubmit({ all, app, cache, model, projects, reporter, req, res, workKey })
}

export { func, help, parameters, path, method }
