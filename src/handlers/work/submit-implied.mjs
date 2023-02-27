import createError from 'http-errors'

import { determineCurrentBranch } from '@liquid-labs/git-toolkit'

import { getSubmitEndpointParams, doSubmit } from './_lib/submit-lib'

const { help, method, parameters } = getSubmitEndpointParams({ descIntro : 'Submits the changes associated with the current unit of work by creating a pull request for the changes in each project associated with the unit of work.' })

const path = ['work', 'submit']

const func = ({ app, cache, model, reporter }) => async(req, res) => {
  const cwd = req.get('X-CWD')
  if (cwd === undefined) { throw createError.BadRequest("Called 'work submit' with implied work, but 'X-CWD' header not found.") }

  const workKey = determineCurrentBranch({ projectPath : cwd, reporter })

  await doSubmit({ app, cache, workKey, reporter, req, res })
}

export { func, help, parameters, path, method }
