import { httpSmartResponse } from '@liquid-labs/http-smart-response'

import { commonCleanParameters } from './_lib/common-clean-parameters'
import { cleanWorkArtifacts } from './_lib/clean-work-artifacts'

const help = {
  name        : 'Work clean',
  summary     : 'Cleans work branches and records.',
  description : `Cleans up the work branches and records associated with an eligable unit of works. By default, the local copy of remote main branches will be updated in order to provide up-to-date information on the status in order to determine whether the work artifacts can be cleaned (removed). This can be supressed with the \`noFetch\` option.

See also 'work XXX status' and 'work XXX detail' for basic static information.`
}

const method = 'put'
const path = ['work', ':workKey', 'clean']
const parameters = [...commonCleanParameters]
Object.freeze(parameters)

const func = ({ app, cache, model, reporter }) => async(req, res) => {
  const {
    noCloseWork = false,
    noDeleteBranches = false,
    noFetch = false,
    noUpdateLocal = false,
    workKey
  } = req.vars

  const closeWork = !noCloseWork
  const deleteBranches = !noDeleteBranches
  const updateLocal = !noUpdateLocal

  const statusReport = await cleanWorkArtifacts({
    allPulls : false,
    app,
    cache,
    closeWork,
    deleteBranches,
    noFetch,
    reporter,
    updateLocal,
    workKey
  })

  const msg = statusReport.isClosed === true
    ? `<bold>Closed<rst> <em>${workKey}<rst>.`
    : `<bold>Unable<rst> to close <em>${workKey}<rst>`

  httpSmartResponse({ msg, req, res })
}

export { func, help, parameters, path, method }
