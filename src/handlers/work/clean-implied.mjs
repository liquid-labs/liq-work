import createError from 'http-errors'

import { determineCurrentBranch } from '@liquid-labs/git-toolkit'
import { httpSmartResponse } from '@liquid-labs/http-smart-response'

import { commonCleanParameters } from './_lib/common-clean-parameters'
import { cleanWorkArtifacts } from './_lib/clean-work-artifacts'
import { WorkDB } from './_lib/work-db'

const help = {
  name        : 'Work clean',
  summary     : 'Cleans work branches and records for current (or all) unit(s) of work.',
  description : `Cleans up the work branches and records associated with the current unit of work, where eligable. The \`all\` option will attempt to clean all open units of work.

See also 'work XXX clean' to specify a unit of work.`
}

const method = 'put'
const path = ['work', 'clean']
const parameters = [
  {
    name        : 'all',
    isBoolean   : true,
    description : 'Attempt to clean all open work rather than the current work unit.'
  },
  ...commonCleanParameters
]
Object.freeze(parameters)

const func = ({ app, cache, model, reporter }) => async(req, res) => {
  const {
    all = false,
    noCloseWork = false,
    noDeleteBranches = false,
    noFetch = false,
    noUpdateLocal = false
  } = req.vars

  const closeWork = !noCloseWork
  const deleteBranches = !noDeleteBranches
  const updateLocal = !noUpdateLocal

  if (all === true) {
    const msgs = []
    const workDB = new WorkDB({ app, reporter })
    for (const workKey of workDB.getWorkKeys()) {
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

      msgs.push(msg)
    }

    httpSmartResponse({ msg : msgs.join('\n'), req, res })
  }
  else {
    const cwd = req.get('X-CWD')
    if (cwd === undefined) { throw createError.BadRequest("Called 'work clean' with implied work, but 'X-CWD' header not found.") }
    const workKey = determineCurrentBranch({ projectPath : cwd })

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
}

export { func, help, parameters, path, method }
